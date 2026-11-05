import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

const activeStates = ["ASSIGNED", "ACCEPTED", "PICKED_UP"];
const fail = (code, message) => { throw new HttpsError(code, message); };
const stamp = () => FieldValue.serverTimestamp();
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

// These handlers use Admin transactions. Clients cannot create assignments,
// change delivery states, read OTP secrets, or mark rider orders delivered.
export function createRiderService(database) {
  async function actor(uid, role) {
    if (!uid) fail("unauthenticated", "Sign in to continue.");
    const profile = (await database.doc(`users/${uid}`).get()).data();
    if (!profile?.roles?.includes(role)) fail("permission-denied", `A PartX ${role} account is required.`);
    return profile;
  }

  async function dispatch(uid, input) {
    await actor(uid, "seller");
    if (input?.action === "assign") {
      const orderId = documentId(input.orderId);
      const riderId = documentId(input.riderId);
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
        if (!["delivery", "garage"].includes(order.fulfilment)) fail("failed-precondition", "Self-pickup orders do not need riders.");
        if (order.orderStatus !== "PLACED" || order.status !== "Packed" || !["PAID", "PAYMENT_DUE"].includes(order.paymentStatus)) fail("failed-precondition", "Pack the confirmed order before assigning a rider.");
        if (!rider?.active || !riderUser.data()?.roles?.includes("rider") || !rider.online || Date.now() - millis(rider.lastSeenAt) > 120_000) fail("failed-precondition", "This rider is offline or unavailable. Ask them to open the rider portal.");
        if (rider.activeDeliveryId) fail("already-exists", "This rider already has an active delivery.");
        if (order.riderDeliveryId) {
          const existing = (await tx.get(database.doc(`deliveries/${documentId(order.riderDeliveryId)}`))).data();
          if (existing && (activeStates.includes(existing.state) || existing.state === "DELIVERED")) fail("already-exists", "This order already has a rider. Cancel the assignment before choosing another rider.");
        }
        const pickup = location(store.location, store.address);
        const destination = location(order.deliveryLocation);
        const items = (Array.isArray(order.items) ? order.items : [{ productName: order.productName, partNumber: order.partNumber, quantity: order.quantity }]).map((item) => ({
          name: text(item.productName || item.name) || "Part", partNumber: text(item.partNumber),
          quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
          imageUrl: text(item.imageUrl, 2000),
        }));
        const amount = Number(order.totalAmount ?? order.total);
        if (!Number.isFinite(amount) || amount <= 0 || !order.customerId) fail("failed-precondition", "This order is missing customer or amount details.");
        tx.create(database.doc(`deliveries/${deliveryId}`), {
          id: deliveryId, orderId, customerId: order.customerId, sellerId: uid,
          storeId: order.storeId, storeName: text(store.name), storePhone: text(store.phone, 30),
          riderId, riderName: text(rider.name), riderPhone: text(rider.phone, 30),
          customer: { name: text(order.customer?.name) || "Customer", phone: text(order.customer?.phone, 30) },
          pickup, destination, fulfilment: order.fulfilment, items, totalAmount: amount,
          codAmount: order.paymentMethod === "cod" && order.paymentStatus === "PAYMENT_DUE" ? amount : 0,
          codCollected: false, state: "ASSIGNED", issue: null,
          assignedAt: stamp(), updatedAt: stamp(),
        });
        tx.update(riderRef, { activeDeliveryId: deliveryId, updatedAt: stamp() });
        tx.update(orderRef, { riderDeliveryId: deliveryId, eta: "PartX rider assigned · Waiting for acceptance", updatedAt: stamp() });
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
      tx.update(database.doc(`orders/${delivery.orderId}`), { status: "Packed", stage: "Preparing", eta: "Ready for a new rider assignment", updatedAt: stamp() });
      tx.delete(database.doc(`deliverySecrets/${deliveryId}`));
      tx.delete(database.doc(`deliveries/${deliveryId}/location/current`));
    });
    return { ok: true };
  }

  async function riderAction(uid, input) {
    await actor(uid, "rider");
    const deliveryId = documentId(input?.deliveryId);
    const action = input?.action;
    if (!["accept", "decline", "pickup", "issue", "complete"].includes(action)) fail("invalid-argument", "Choose a valid delivery action.");
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
      if (rider.activeDeliveryId !== deliveryId || !activeStates.includes(delivery.state)) fail("failed-precondition", "This delivery is no longer active.");
      const orderRef = database.doc(`orders/${delivery.orderId}`);
      const order = (await tx.get(orderRef)).data();
      if (!order || order.riderDeliveryId !== deliveryId || order.orderStatus !== "PLACED" || order.stage === "Delivered") fail("failed-precondition", "The order is no longer available for this delivery.");
      if (action === "accept") {
        if (delivery.state !== "ASSIGNED") fail("failed-precondition", "This assignment has already been accepted.");
        tx.update(deliveryRef, { state: "ACCEPTED", acceptedAt: stamp(), updatedAt: stamp() });
        tx.update(orderRef, { eta: "Your rider is heading to the store", updatedAt: stamp() });
      } else if (action === "decline") {
        if (delivery.state !== "ASSIGNED") fail("failed-precondition", "Contact the seller to cancel an accepted delivery.");
        const reason = text(input.reason, 500);
        if (reason.length < 5) fail("invalid-argument", "Add a short reason for declining.");
        tx.update(deliveryRef, { state: "DECLINED", closedReason: reason, closedAt: stamp(), updatedAt: stamp() });
        tx.update(riderRef, { activeDeliveryId: null, updatedAt: stamp() });
        tx.update(orderRef, { eta: "Waiting for another rider", updatedAt: stamp() });
      } else if (action === "pickup") {
        if (delivery.state !== "ACCEPTED") fail("failed-precondition", "Accept this assignment before confirming pickup.");
        tx.update(deliveryRef, { state: "PICKED_UP", pickedUpAt: stamp(), updatedAt: stamp() });
        tx.update(orderRef, { status: "Dispatched", stage: "On the way", eta: "Your PartX rider is on the way", updatedAt: stamp() });
      } else if (action === "issue") {
        if (!["ACCEPTED", "PICKED_UP"].includes(delivery.state)) fail("failed-precondition", "Accept the delivery before reporting an issue.");
        const reason = text(input.reason, 500);
        if (reason.length < 10) fail("invalid-argument", "Describe the problem in at least 10 characters.");
        tx.update(deliveryRef, { issue: { reason, reportedAt: Timestamp.now() }, updatedAt: stamp() });
        tx.update(orderRef, { eta: "Delivery issue reported · Your seller is reviewing it", updatedAt: stamp() });
      } else {
        if (delivery.state !== "PICKED_UP") fail("failed-precondition", "Confirm pickup before completing delivery.");
        if (delivery.codAmount > 0 && input.codCollected !== true) fail("failed-precondition", "Collect the cash-on-delivery amount before confirming delivery.");
        if (!secret || millis(secret.expiresAt) <= Date.now()) fail("failed-precondition", "Ask the customer to open the order and generate a fresh delivery code.");
        if (millis(secret.lockedUntil) > Date.now()) fail("resource-exhausted", "Too many incorrect codes. Wait five minutes and ask the customer for a new code.");
        const code = typeof input.code === "string" ? input.code.trim() : "";
        if (!/^\d{6}$/.test(code)) fail("invalid-argument", "Enter the customer's six-digit delivery code.");
        if (!timingSafeEqual(Buffer.from(code), Buffer.from(secret.code))) {
          const attempts = (secret.attempts || 0) + 1;
          tx.update(secretRef, { attempts, ...(attempts >= 5 ? { lockedUntil: Timestamp.fromMillis(Date.now() + 300_000) } : {}) });
          // Return the error after commit so attempts are not rolled back.
          return { incorrectCode: true };
        }
        tx.update(deliveryRef, { state: "DELIVERED", codCollected: delivery.codAmount > 0, ...(delivery.codAmount > 0 ? { codCollectedAt: stamp() } : {}), deliveredAt: stamp(), updatedAt: stamp() });
        tx.update(orderRef, { status: "Delivered", stage: "Delivered", eta: "Delivered", deliveredAt: stamp(), ...(delivery.codAmount > 0 ? { codCollected: true, codCollectedAt: stamp(), codCollectedBy: uid } : {}), updatedAt: stamp() });
        tx.update(riderRef, { activeDeliveryId: null, updatedAt: stamp() });
        tx.delete(secretRef);
        tx.delete(database.doc(`deliveries/${deliveryId}/location/current`));
      }
      return { ok: true };
    });
    if (result.incorrectCode) fail("invalid-argument", "That delivery code is incorrect. Check the code with the customer.");
    return result;
  }

  async function customerCode(uid, input) {
    await actor(uid, "customer");
    const deliveryId = documentId(input?.deliveryId);
    return database.runTransaction(async (tx) => {
      const delivery = (await tx.get(database.doc(`deliveries/${deliveryId}`))).data();
      if (!delivery || delivery.customerId !== uid) fail("permission-denied", "This is not your delivery.");
      if (delivery.state !== "PICKED_UP") fail("failed-precondition", "Delivery codes are available after the rider picks up your order.");
      const ref = database.doc(`deliverySecrets/${deliveryId}`);
      const secret = (await tx.get(ref)).data();
      if (millis(secret?.lockedUntil) > Date.now()) fail("resource-exhausted", "Delivery code entry is temporarily locked. Please try again in five minutes.");
      if (secret && millis(secret.expiresAt) > Date.now() && !secret.lockedUntil) return { code: secret.code, expiresAt: millis(secret.expiresAt) };
      const code = String(randomInt(100000, 1000000));
      const expiresAt = Date.now() + 30 * 60_000;
      tx.set(ref, { code, expiresAt: Timestamp.fromMillis(expiresAt), attempts: 0, createdAt: stamp() });
      return { code, expiresAt };
    });
  }
  return { dispatch, riderAction, customerCode };
}
