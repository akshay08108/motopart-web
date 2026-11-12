export class DeliveryError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = "DeliveryError"; }
}

const activeStates = ["ASSIGNED", "ACCEPTED", "PICKED_UP"];
const fail = (code, message) => { throw new DeliveryError(code, message); };
const text = (value, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const millis = (value) => value?.toMillis?.() ?? 0;
function documentId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) fail("invalid-argument", "A valid delivery or order ID is required.");
  return value;
}
function location(value, fallback = "") {
  const address = text(value?.address || fallback, 500);
  if (address.length < 10) fail("failed-precondition", "Save the full pickup and delivery addresses before assigning a rider.");
  const result = { address };
  if (Number.isFinite(value?.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value?.longitude) && Math.abs(value.longitude) <= 180) {
    result.latitude = value.latitude;
    result.longitude = value.longitude;
  }
  return result;
}
export const defaultRiderEarningsPolicy = { mode: "per_km", ratePaisePerKm: 500, payer: "partx", returnIncluded: true };
function assignmentEarnings(configuredPolicy, oneWayKm) {
  const policy = configuredPolicy ?? defaultRiderEarningsPolicy;
  if (policy.mode === "per_km") {
    if (!Number.isSafeInteger(policy.ratePaisePerKm) || policy.ratePaisePerKm < 0 || policy.ratePaisePerKm > 100000 || typeof policy.returnIncluded !== "boolean" || !["store", "partx"].includes(policy.payer)) fail("failed-precondition", "The rider earning rate needs to be corrected by PartX operations.");
    if (typeof oneWayKm !== "number" || !Number.isFinite(oneWayKm) || oneWayKm <= 0 || oneWayKm > 1000 || Math.round(oneWayKm * 1000) < 1) fail("invalid-argument", "Enter the one-way road distance in kilometres before assigning a rider.");
    const oneWayMeters = Math.round(oneWayKm * 1000);
    const returnIncluded = policy.returnIncluded;
    const billableMeters = oneWayMeters * (returnIncluded ? 2 : 1);
    return { amountPaise: Math.round(policy.ratePaisePerKm * billableMeters / 1000), payer: policy.payer, currency: "INR", status: "PENDING_DELIVERY", pricing: { mode: "per_km", ratePaisePerKm: policy.ratePaisePerKm, oneWayMeters, billableMeters, returnIncluded, source: "seller_entered" } };
  }
  if (policy.mode && policy.mode !== "per_delivery") fail("failed-precondition", "The rider earning rate needs to be corrected by PartX operations.");
  if (!Number.isSafeInteger(policy.amountPaise) || policy.amountPaise < 0 || policy.amountPaise > 100_000_000 || !["store", "partx"].includes(policy.payer)) fail("failed-precondition", "The rider earning rate needs to be corrected by PartX operations.");
  return { amountPaise: policy.amountPaise, payer: policy.payer, currency: "INR", status: "PENDING_DELIVERY" };
}

// The database adapter must provide atomic transactions. Clients cannot create assignments,
// change delivery states, read OTP secrets, or mark rider orders delivered.
export function createRiderCore(database, runtime) {
  const stamp = runtime.serverTimestamp;
  const { randomUUID, generateCode, equalCodes, timestampNow, timestampFromMillis } = runtime;
  async function actor(uid, role) {
    if (!uid) fail("unauthenticated", "Sign in to continue.");
    const profile = (await database.doc(`users/${uid}`).get()).data();
    const activeRole = profile?.activeRole ?? (profile?.roles?.length === 1 ? profile.roles[0] : null);
    if (activeRole !== role || !profile?.roles?.includes(role)) fail("permission-denied", `A PartX ${role} account is required.`);
    return profile;
  }

  async function requestAfterSale(uid, input) {
    await actor(uid, "customer");
    const orderId = documentId(input?.orderId);
    const { itemIndex, kind } = input ?? {};
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || !["return", "replacement"].includes(kind)) {
      fail("invalid-argument", "Choose an item and a return or replacement.");
    }
    const reason = text(input.reason, 500);
    if (reason.length < 5) fail("invalid-argument", "Add a short reason for this request.");
    const requestId = String(itemIndex);
    return database.runTransaction(async (tx) => {
      const orderRef = database.doc(`orders/${orderId}`);
      const order = (await tx.get(orderRef)).data();
      if (!order || order.customerId !== uid) fail("permission-denied", "This is not your order.");
      const deliveredAt = millis(order.deliveredAt);
      if (order.stage !== "Delivered" || !deliveredAt || Date.now() >= deliveredAt + 172_800_000) {
        fail("failed-precondition", "Request a return or replacement within 48 hours of delivery.");
      }
      const item = order.items?.[itemIndex];
      if (!item || (kind === "return" ? item.returnable !== true : item.replaceable !== true)) {
        fail("failed-precondition", "This item was not sold with the selected policy.");
      }
      const ref = database.doc(`orders/${orderId}/afterSales/${requestId}`);
      const existing = (await tx.get(ref)).data();
      if (existing) {
        if (existing.kind === kind) return { requestId };
        fail("already-exists", "A request already exists for this item.");
      }
      const savedAddress = order.deliveryLocation ?? (await tx.get(database.doc(`users/${uid}/deliveryLocations/default`))).data();
      const customerLocation = location(savedAddress);
      tx.create(ref, { kind, itemIndex, item, reason, customerLocation, state: "REQUESTED", createdAt: stamp(), updatedAt: stamp() });
      tx.update(orderRef, { afterSalesCount: (order.afterSalesCount ?? 0) + 1, updatedAt: stamp() });
      return { requestId };
    });
  }

  async function dispatch(uid, input) {
    await actor(uid, "seller");
    if (input?.action === "assign") {
      const orderId = documentId(input.orderId);
      const riderId = documentId(input.riderId);
      const requestId = input.requestId == null ? null : documentId(input.requestId);
      const deliveryId = randomUUID();
      await database.runTransaction(async (tx) => {
        const orderRef = database.doc(`orders/${orderId}`);
        const riderRef = database.doc(`riders/${riderId}`);
        const [orderSnapshot, riderSnapshot, riderUser] = await Promise.all([tx.get(orderRef), tx.get(riderRef), tx.get(database.doc(`users/${riderId}`))]);
        const order = orderSnapshot.data();
        const rider = riderSnapshot.data();
        if (!order) fail("not-found", "Order not found.");
        const store = (await tx.get(database.doc(`stores/${documentId(order.storeId)}`))).data();
        if (store?.ownerId !== uid || order.sellerId !== uid) fail("permission-denied", "You can only assign deliveries for your own store.");
        const requestRef = requestId === null ? null : database.doc(`orders/${orderId}/afterSales/${requestId}`);
        const request = requestRef ? (await tx.get(requestRef)).data() : null;
        if (requestRef && (!request || request.state !== "REQUESTED")) fail("failed-precondition", "This request is no longer awaiting assignment.");
        if (!request && !["delivery", "garage"].includes(order.fulfilment)) fail("failed-precondition", "Self-pickup orders do not need riders.");
        if (!request && (order.orderStatus !== "PLACED" || order.status !== "Packed" || !["PAID", "PAYMENT_DUE"].includes(order.paymentStatus))) fail("failed-precondition", "Pack the confirmed order before assigning a rider.");
        if (!rider?.active || !riderUser.data()?.roles?.includes("rider") || !rider.online || Date.now() - millis(rider.lastSeenAt) > 120_000) fail("failed-precondition", "This rider is offline or unavailable. Ask them to open the rider portal.");
        if (rider.activeDeliveryId) fail("already-exists", "This rider already has an active delivery.");
        if (!request && order.riderDeliveryId) {
          const existing = (await tx.get(database.doc(`deliveries/${documentId(order.riderDeliveryId)}`))).data();
          if (existing && (activeStates.includes(existing.state) || existing.state === "DELIVERED")) fail("already-exists", "This order already has a rider. Cancel the assignment before choosing another rider.");
        }
        const storeLocation = location(store.location, store.address);
        const customerLocation = request ? location(request.customerLocation) : location(order.deliveryLocation);
        const kind = request?.kind ?? "delivery";
        const pickup = kind === "return" ? customerLocation : storeLocation;
        const destination = kind === "return" ? storeLocation : customerLocation;
        const pickupId = kind === "replacement" ? `PX-PICKUP-${randomUUID()}` : null;
        const items = (request ? [request.item] : Array.isArray(order.items) ? order.items : [{ productName: order.productName, partNumber: order.partNumber, quantity: order.quantity }]).map((item) => ({
          name: text(item.productName || item.name) || "Part", partNumber: text(item.partNumber),
          quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
          imageUrl: text(item.imageUrl, 2000),
        }));
        const amount = Number(order.totalAmount ?? order.total);
        if (!Number.isFinite(amount) || amount <= 0 || !order.customerId) fail("failed-precondition", "This order is missing customer or amount details.");
        tx.create(database.doc(`deliveries/${deliveryId}`), {
          id: deliveryId, trackingId: `PX-RIDE-${deliveryId}`, kind, ...(requestId !== null ? { requestId } : {}), ...(pickupId ? { pickupId } : {}), orderId, customerId: order.customerId, sellerId: uid,
          storeId: order.storeId, storeName: text(store.name), storePhone: text(store.phone, 30),
          riderId, riderName: text(rider.name), riderPhone: text(rider.phone, 30),
          customer: { name: text(order.customer?.name) || "Customer", phone: text(order.customer?.phone, 30) },
          pickup, destination, fulfilment: order.fulfilment, items, totalAmount: amount,
          codAmount: !request && order.paymentMethod === "cod" && order.paymentStatus === "PAYMENT_DUE" ? amount : 0,
          codCollected: false, state: "ASSIGNED", issue: null, earnings: assignmentEarnings(rider.earningsPolicy, input.oneWayDistanceKm),
          assignedAt: stamp(), updatedAt: stamp(),
        });
        tx.update(riderRef, { activeDeliveryId: deliveryId, updatedAt: stamp() });
        if (requestRef) tx.update(requestRef, { deliveryId, state: "ASSIGNED", updatedAt: stamp() });
        else tx.update(orderRef, { riderDeliveryId: deliveryId, eta: "PartX rider assigned · Waiting for acceptance", updatedAt: stamp() });
      });
      return { deliveryId };
    }
    if (!["cancel", "returned"].includes(input?.action)) fail("invalid-argument", "Choose a valid dispatch action.");
    const deliveryId = documentId(input.deliveryId);
    await database.runTransaction(async (tx) => {
      const ref = database.doc(`deliveries/${deliveryId}`);
      const delivery = (await tx.get(ref)).data();
      if (!delivery) fail("not-found", "Delivery not found.");
      const store = (await tx.get(database.doc(`stores/${delivery.storeId}`))).data();
      if (delivery.sellerId !== uid || store?.ownerId !== uid) fail("permission-denied", "You cannot manage another store's delivery.");
      const riderRef = database.doc(`riders/${delivery.riderId}`);
      const rider = (await tx.get(riderRef)).data();
      if (input.action === "cancel" && !["ASSIGNED", "ACCEPTED"].includes(delivery.state)) fail("failed-precondition", "A picked-up delivery must be returned to the store before it can be reassigned.");
      if (input.action === "returned" && (delivery.state !== "PICKED_UP" || !delivery.issue)) fail("failed-precondition", "Confirm a reported delivery has physically returned to the store.");
      const reason = text(input.reason, 500);
      if (reason.length < 5) fail("invalid-argument", "Please explain why this delivery is being closed.");
      tx.update(ref, { state: input.action === "cancel" ? "CANCELLED" : "RETURNED", closedReason: reason, closedAt: stamp(), updatedAt: stamp() });
      if (rider?.activeDeliveryId === deliveryId) tx.update(riderRef, { activeDeliveryId: null, updatedAt: stamp() });
      if (delivery.requestId != null) {
        const completed = input.action === "returned" && (delivery.kind === "return" || Boolean(delivery.exchangeAt));
        tx.update(database.doc(`orders/${delivery.orderId}/afterSales/${delivery.requestId}`), { state: completed ? "COMPLETED" : "REQUESTED", updatedAt: stamp() });
        if (completed && delivery.earnings) {
          tx.update(ref, { state: "DELIVERED", deliveredAt: stamp(), earnings: { ...delivery.earnings, status: "EARNED", earnedAt: timestampNow() } });
        }
      } else tx.update(database.doc(`orders/${delivery.orderId}`), { status: "Packed", stage: "Preparing", eta: "Ready for a new rider assignment", updatedAt: stamp() });
      tx.delete(database.doc(`deliverySecrets/${deliveryId}`));
      tx.delete(database.doc(`deliveries/${deliveryId}/location/current`));
    });
    return { ok: true };
  }

  async function riderAction(uid, input) {
    await actor(uid, "rider");
    const deliveryId = documentId(input?.deliveryId);
    const action = input?.action;
    if (!["accept", "decline", "pickup", "issue", "exchange", "complete"].includes(action)) fail("invalid-argument", "Choose a valid delivery action.");
    const result = await database.runTransaction(async (tx) => {
      const deliveryRef = database.doc(`deliveries/${deliveryId}`);
      const riderRef = database.doc(`riders/${uid}`);
      const secretRef = database.doc(`deliverySecrets/${deliveryId}`);
      const [snapshot, riderSnapshot, secretSnapshot] = await Promise.all([tx.get(deliveryRef), tx.get(riderRef), tx.get(secretRef)]);
      const delivery = snapshot.data();
      const rider = riderSnapshot.data();
      const secret = secretSnapshot.data();
      if (!delivery || delivery.riderId !== uid || !rider?.active) fail("permission-denied", "This delivery is not assigned to your active rider account.");
      if (action === "complete" && delivery.state === "DELIVERED") return { ok: true };
      if (action === "exchange" && delivery.exchangeAt) return { ok: true };
      if (rider.activeDeliveryId !== deliveryId || !activeStates.includes(delivery.state)) fail("failed-precondition", "This delivery is no longer active.");
      const orderRef = database.doc(`orders/${delivery.orderId}`);
      const order = (await tx.get(orderRef)).data();
      const requestRef = delivery.requestId == null ? null : database.doc(`orders/${delivery.orderId}/afterSales/${delivery.requestId}`);
      const request = requestRef ? (await tx.get(requestRef)).data() : null;
      if (!order || (requestRef ? request?.deliveryId !== deliveryId || request.state !== "ASSIGNED" : order.riderDeliveryId !== deliveryId || order.orderStatus !== "PLACED" || order.stage === "Delivered")) fail("failed-precondition", "The order is no longer available for this delivery.");
      const returning = delivery.kind === "return";
      const replacing = delivery.kind === "replacement";
      if (action === "exchange" && (!replacing || delivery.state !== "PICKED_UP" || delivery.exchangeAt)) {
        fail("failed-precondition", "There is no exchange awaiting handover.");
      }
      if (action === "exchange" && input.handoverConfirmed !== true) fail("failed-precondition", "Confirm both handovers at the customer stop.");
      if (replacing && action === "complete" && !delivery.exchangeAt) fail("failed-precondition", "Confirm the exchange with the customer first.");
      const needsCode = action === "complete" || action === "exchange" || (action === "pickup" && returning);
      if (needsCode) {
        const pickupCode = returning && action === "pickup";
        if (delivery.state !== (pickupCode ? "ACCEPTED" : "PICKED_UP")) fail("failed-precondition", "Confirm the previous stop first.");
        if (delivery.codAmount > 0 && input.codCollected !== true) fail("failed-precondition", "Collect the cash-on-delivery amount before confirming delivery.");
        if (!secret || millis(secret.expiresAt) <= Date.now()) fail("failed-precondition", "Ask the person at this stop for a fresh confirmation code.");
        if (millis(secret.lockedUntil) > Date.now()) fail("resource-exhausted", "Too many incorrect codes. Wait five minutes and request a new code.");
        const code = typeof input.code === "string" ? input.code.trim() : "";
        if (!/^\d{6}$/.test(code)) fail("invalid-argument", "Enter the six-digit confirmation code.");
        if (!equalCodes(code, secret.code)) {
          const attempts = (secret.attempts || 0) + 1;
          tx.update(secretRef, { attempts, ...(attempts >= 5 ? { lockedUntil: timestampFromMillis(Date.now() + 300_000) } : {}) });
          return { incorrectCode: true };
        }
        tx.delete(secretRef);
      }
      if (action === "accept") {
        if (delivery.state !== "ASSIGNED") fail("failed-precondition", "This assignment has already been accepted.");
        tx.update(deliveryRef, { state: "ACCEPTED", acceptedAt: stamp(), updatedAt: stamp() });
        if (!requestRef) tx.update(orderRef, { eta: "Your rider is heading to the store", updatedAt: stamp() });
      } else if (action === "decline") {
        if (delivery.state !== "ASSIGNED") fail("failed-precondition", "Contact the seller to cancel an accepted delivery.");
        const reason = text(input.reason, 500);
        if (reason.length < 5) fail("invalid-argument", "Add a short reason for declining.");
        tx.update(deliveryRef, { state: "DECLINED", closedReason: reason, closedAt: stamp(), updatedAt: stamp() });
        tx.update(riderRef, { activeDeliveryId: null, updatedAt: stamp() });
        if (requestRef) tx.update(requestRef, { state: "REQUESTED", updatedAt: stamp() });
        else tx.update(orderRef, { eta: "Waiting for another rider", updatedAt: stamp() });
      } else if (action === "pickup") {
        if (delivery.state !== "ACCEPTED") fail("failed-precondition", "Accept this assignment before confirming pickup.");
        tx.update(deliveryRef, { state: "PICKED_UP", pickedUpAt: stamp(), updatedAt: stamp() });
        if (!requestRef) tx.update(orderRef, { status: "Dispatched", stage: "On the way", eta: "Your PartX rider is on the way", updatedAt: stamp() });
      } else if (action === "issue") {
        if (!["ACCEPTED", "PICKED_UP"].includes(delivery.state)) fail("failed-precondition", "Accept the delivery before reporting an issue.");
        const reason = text(input.reason, 500);
        if (reason.length < 10) fail("invalid-argument", "Describe the problem in at least 10 characters.");
        tx.update(deliveryRef, { issue: { reason, reportedAt: timestampNow() }, updatedAt: stamp() });
        if (!requestRef) tx.update(orderRef, { eta: "Delivery issue reported · Your seller is reviewing it", updatedAt: stamp() });
      } else if (action === "exchange") {
        tx.update(deliveryRef, { exchangeAt: stamp(), updatedAt: stamp() });
      } else {
        tx.update(deliveryRef, { state: "DELIVERED", ...(delivery.earnings ? { earnings: { ...delivery.earnings, status: "EARNED", earnedAt: timestampNow() } } : {}), codCollected: delivery.codAmount > 0, ...(delivery.codAmount > 0 ? { codCollectedAt: stamp() } : {}), deliveredAt: stamp(), updatedAt: stamp() });
        if (requestRef) tx.update(requestRef, { state: "COMPLETED", updatedAt: stamp() });
        else tx.update(orderRef, { status: "Delivered", stage: "Delivered", eta: "Delivered", deliveredAt: stamp(), ...(delivery.codAmount > 0 ? { codCollected: true, codCollectedAt: stamp(), codCollectedBy: uid } : {}), updatedAt: stamp() });
        tx.update(riderRef, { activeDeliveryId: null, updatedAt: stamp() });
        tx.delete(database.doc(`deliveries/${deliveryId}/location/current`));
      }
      return { ok: true };
    });
    if (result.incorrectCode) fail("invalid-argument", "That delivery code is incorrect. Check the code with the customer.");
    return result;
  }

  async function customerCode(uid, input) {
    const storeReceipt = input?.storeReceipt === true;
    await actor(uid, storeReceipt ? "seller" : "customer");
    const deliveryId = documentId(input?.deliveryId);
    return database.runTransaction(async (tx) => {
      const delivery = (await tx.get(database.doc(`deliveries/${deliveryId}`))).data();
      if (!delivery || (storeReceipt ? delivery.sellerId !== uid : delivery.customerId !== uid)) fail("permission-denied", "This is not your delivery.");
      const allowed = storeReceipt
        ? delivery.state === "PICKED_UP" && (delivery.kind === "return" || (delivery.kind === "replacement" && delivery.exchangeAt))
        : delivery.kind === "return" ? delivery.state === "ACCEPTED" : delivery.state === "PICKED_UP" && !delivery.exchangeAt;
      if (!allowed) fail("failed-precondition", "This ride is not awaiting your confirmation code.");
      if (storeReceipt) {
        const store = (await tx.get(database.doc(`stores/${delivery.storeId}`))).data();
        if (store?.ownerId !== uid) fail("permission-denied", "This is not your store.");
      }
      const [orderSnapshot, riderSnapshot] = await Promise.all([tx.get(database.doc(`orders/${delivery.orderId}`)), tx.get(database.doc(`riders/${delivery.riderId}`))]);
      const order = orderSnapshot.data();
      if (!order || (!delivery.requestId && (order.riderDeliveryId !== deliveryId || order.orderStatus !== "PLACED")) || riderSnapshot.data()?.activeDeliveryId !== deliveryId) fail("failed-precondition", "This delivery is no longer awaiting confirmation. Refresh your order for its latest status.");
      if (!delivery.requestId && !["PAID", "PAYMENT_DUE"].includes(order.paymentStatus)) fail("failed-precondition", "Your seller must confirm the payment before a delivery code can be generated.");
      const ref = database.doc(`deliverySecrets/${deliveryId}`);
      const secret = (await tx.get(ref)).data();
      if (millis(secret?.lockedUntil) > Date.now()) fail("resource-exhausted", "Delivery code entry is temporarily locked. Please try again in five minutes.");
      const currentTime = Date.now();
      const validSecret = secret && millis(secret.expiresAt) > currentTime && !secret.lockedUntil;
      const regenerateAfter = millis(secret?.createdAt) + 30_000;
      if (validSecret && input.regenerate !== true) return { code: secret.code, expiresAt: millis(secret.expiresAt), regenerateAfter };
      if (validSecret && currentTime < regenerateAfter) fail("resource-exhausted", "Wait 30 seconds between generating delivery codes. You can still show the current code.");
      let code = generateCode();
      if (code === secret?.code) code = String(100000 + (Number(code) - 100000 + 1) % 900000);
      const expiresAt = currentTime + 30 * 60_000;
      tx.set(ref, { code, expiresAt: timestampFromMillis(expiresAt), attempts: validSecret ? secret.attempts || 0 : 0, createdAt: stamp() });
      return { code, expiresAt, regenerateAfter: currentTime + 30_000 };
    });
  }
  return { dispatch, riderAction, customerCode, requestAfterSale };
}
