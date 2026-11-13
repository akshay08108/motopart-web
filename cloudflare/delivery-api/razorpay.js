import { DeliveryError } from "../../functions/rider-core.js";
import { SERVER_TIMESTAMP } from "./firestore-rest.js";
import { quoteDelivery, occupiesDeliveryOffer, freeDeliverySlots } from "../../lib/delivery-pricing.ts";

const fail = (code, message) => { throw new DeliveryError(code, message); };
const encoder = new TextEncoder();
const id = (value, prefix = "") => typeof value === "string" && value.startsWith(prefix) && /^[A-Za-z0-9_-]{1,140}$/.test(value);
const attemptId = (value) => typeof value === "string" && /^PX-TEST-[a-f0-9]{32}$/.test(value);
const paise = (value) => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : NaN;
const listed = (setting, value) => Boolean(value && setting?.split(",").some((entry) => entry.trim() === value));

export const paymentEndpoints = new Set(["razorpayAvailability", "razorpayCreateOrder", "razorpayVerify", "razorpayStatus", "razorpayTransferStatus", "razorpayWebhook"]);

async function validSignature(secret, message, signature) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.match(/../g), (part) => parseInt(part, 16));
  return crypto.subtle.verify("HMAC", key, bytes, typeof message === "string" ? encoder.encode(message) : message);
}

export function createRazorpay(database, env, fetcher) {
  const configured = /^rzp_test_[A-Za-z0-9]+$/.test(env.RAZORPAY_TEST_KEY_ID ?? "")
    && Boolean(env.RAZORPAY_TEST_KEY_SECRET && env.RAZORPAY_TEST_WEBHOOK_SECRET);
  const pilotCustomer = (uid) => listed(env.RAZORPAY_TEST_CUSTOMERS, uid);
  const pilotStore = (storeId) => listed(env.RAZORPAY_TEST_STORES, storeId);
  let linkedAccounts = {};
  try { linkedAccounts = JSON.parse(env.RAZORPAY_TEST_LINKED_ACCOUNTS || "{}") ?? {}; } catch { /* No linked accounts configured. */ }
  const linkedAccount = (storeId) => id(linkedAccounts[storeId], "acc_") ? linkedAccounts[storeId] : null;
  const read = async (path) => (await database.doc(path).get()).data();

  async function api(path, data) {
    let response;
    try {
      response = await fetcher(`https://api.razorpay.com/v1/${path}`, {
        method: data ? "POST" : "GET",
        headers: {
          Authorization: `Basic ${btoa(`${env.RAZORPAY_TEST_KEY_ID}:${env.RAZORPAY_TEST_KEY_SECRET}`)}`,
          "Content-Type": "application/json",
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      fail("unavailable", "Razorpay is taking longer than expected. Retry this payment attempt.");
    }
    return { ok: response.ok, data: await response.json().catch(() => ({})) };
  }

  async function availability(uid, { storeId }) {
    if (!configured || !id(storeId) || !pilotStore(storeId)) return { enabled: false };
    const store = await read(`stores/${storeId}`);
    if (!store || (store.ownerId !== uid && !pilotCustomer(uid))) return { enabled: false };
    return { enabled: true, route: Boolean(linkedAccount(storeId)) };
  }

  async function priceOrder(uid, orderId, input) {
    const { storeId, fulfilment, items, expectedAmount } = input;
    if (!id(storeId) || !pilotStore(storeId) || !["pickup", "delivery", "garage"].includes(fulfilment)
      || !Array.isArray(items) || items.length === 0 || items.length > 30 || !Number.isSafeInteger(expectedAmount)) {
      fail("invalid-argument", "Review your store, items and total before continuing.");
    }
    if (items.some((item) => !id(item?.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)
      || new Set(items.map((item) => item.productId)).size !== items.length) {
      fail("invalid-argument", "The cart contains invalid items or quantities.");
    }
    const storeRef = database.doc(`stores/${storeId}`);
    const products = items.map((item) => database.doc(`products/${item.productId}`));
    const orderRef = database.doc(`orders/${orderId}`);
    const [profile, home, garage, legacyOrders] = await Promise.all([
      read(`users/${uid}`),
      fulfilment === "delivery" ? read(`users/${uid}/deliveryLocations/default`) : null,
      fulfilment === "garage" ? read(`users/${uid}/preferences/garage`) : null,
      fulfilment === "pickup" ? [] : database.ordersForCustomer(uid),
    ]);
    if (!profile?.roles?.includes("customer") || profile.activeRole !== "customer") fail("permission-denied", "Sign in as a customer to start checkout.");
    const address = fulfilment === "garage" ? garage?.garages?.[0]?.location : home;
    const cartKey = JSON.stringify([storeId, fulfilment, items.map(({ productId, quantity }) => [productId, quantity]).sort()]);
    return database.runTransaction(async (tx) => {
      const existing = (await tx.get(orderRef)).data();
      if (existing) {
        if (existing.customerId !== uid || existing.paymentMethod !== "razorpay" || existing.razorpayCartKey !== cartKey) {
          fail("permission-denied", "This payment attempt belongs to a different checkout.");
        }
        return existing;
      }
      const [storeSnapshot, ...snapshots] = await Promise.all([tx.get(storeRef), ...products.map((ref) => tx.get(ref))]);
      const store = storeSnapshot.data();
      if (!store?.ownerId || typeof store.name !== "string" || !["approved", "pending"].includes(store.status)) fail("failed-precondition", "This store is unavailable.");
      const priced = snapshots.map((snapshot, index) => {
        const product = snapshot.data();
        const { productId, quantity } = items[index];
        const unitPaise = paise(product?.sellingPrice);
        if (!product || product.storeId !== storeId || product.sellerId !== store.ownerId || product.status !== "published"
          || !Number.isSafeInteger(unitPaise) || unitPaise <= 0 || !Number.isSafeInteger(product.stock) || product.stock < quantity) {
          fail("failed-precondition", "A part is unavailable or has insufficient stock. Review your cart.");
        }
        return {
          productId, quantity, unitPrice: unitPaise / 100, storeId, storeName: store.name,
          productName: product.name || "Auto part", partNumber: product.partNumber || "",
          imageUrl: typeof product.imageUrl === "string" ? product.imageUrl : null,
          imageIndex: Number.isInteger(product.imageIndex) ? product.imageIndex : 0,
          returnable: false, replaceable: false,
        };
      });
      const subtotal = priced.reduce((sum, line) => sum + paise(line.unitPrice) * line.quantity, 0);
      let free = false;
      if (fulfilment !== "pickup") {
        const count = legacyOrders.filter((order) => order.paymentMethod !== "razorpay" && !order.deliveryPricingV1 && occupiesDeliveryOffer(order)).length;
        const slots = freeDeliverySlots.slice(0, Math.max(0, freeDeliverySlots.length - count));
        const available = await Promise.all(slots.map(async (slot) => {
          const claim = (await tx.get(database.doc(`users/${uid}/deliveryOffer/${slot}`))).data();
          if (typeof claim?.orderId !== "string") return true;
          if (!id(claim.orderId)) return false;
          const order = (await tx.get(database.doc(`orders/${claim.orderId}`))).data();
          return order?.customerId === uid && !occupiesDeliveryOffer(order);
        }));
        free = available.some(Boolean);
      }
      const quote = quoteDelivery(fulfilment, { ...store, location: store.location ?? { address: store.address ?? "" } }, typeof address?.address === "string" ? address : undefined, free);
      if (quote.fee === null) fail("failed-precondition", quote.message);
      const amount = subtotal + paise(quote.fee);
      if (!Number.isSafeInteger(amount) || amount < 100 || amount !== expectedAmount) fail("failed-precondition", "Your price or delivery fee changed. Review the total and try again.");
      const [first] = priced;
      const routeAccount = linkedAccount(storeId);
      const order = {
        customerId: uid, sellerId: store.ownerId, storeId, storeName: store.name,
        customer: { name: profile.name || "Customer", phone: profile.mobile || "", email: profile.email || "" },
        trackingId: `PX-TRK-${orderId.slice(8)}`, fulfilment, status: "New", stage: "Confirmed",
        placedAt: "Just now", eta: "Waiting for Razorpay test payment", deadline: "Test order",
        paymentMethod: "razorpay", paymentMode: "test", paymentStatus: "PENDING", orderStatus: "PAYMENT_PENDING",
        currency: "INR", subtotal: subtotal / 100, discount: 0, deliveryCharge: quote.fee, total: amount / 100, totalAmount: amount / 100,
        deliveryPricingV1: true, razorpayCartKey: cartKey,
        ...(routeAccount ? { razorpayRouteAccount: routeAccount, razorpayRouteAmount: subtotal } : {}),
        ...(address && fulfilment !== "pickup" ? { deliveryLocation: address } : {}),
        productId: first.productId, productName: first.productName, partNumber: first.partNumber,
        imageUrl: first.imageUrl, imageIndex: first.imageIndex, items: priced,
        quantity: priced.reduce((total, item) => total + item.quantity, 0),
        createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP,
      };
      tx.create(orderRef, order);
      return order;
    });
  }

  async function start(uid, input) {
    if (!configured || !pilotCustomer(uid)) fail("permission-denied", "Razorpay Test Mode is unavailable for this account.");
    const orderId = input.orderId;
    if (!attemptId(orderId)) fail("invalid-argument", "Invalid checkout attempt.");
    const order = input.resume ? await customerOrder(uid, orderId) : await priceOrder(uid, orderId, input);
    if (!pilotStore(order.storeId)) fail("permission-denied", "This store is outside the Razorpay pilot.");
    if (order.paymentStatus === "PAID") return { orderId, paid: true };
    const amount = paise(order.totalAmount);
    let razorpayOrderId = order.razorpayOrderId;
    if (!razorpayOrderId) {
      const created = await api("orders", {
        amount, currency: "INR", receipt: orderId, partial_payment: false,
        ...(order.razorpayRouteAccount ? { transfers: [{ account: order.razorpayRouteAccount, amount: order.razorpayRouteAmount, currency: "INR" }] } : {}),
      });
      let entity = created.data;
      if (!created.ok) {
        const found = await api(`orders?receipt=${orderId}`);
        entity = found.data.items?.find((candidate) => candidate.receipt === orderId);
      }
      if (!entity || !id(entity.id, "order_") || entity.receipt !== orderId || entity.currency !== "INR" || entity.amount !== amount) {
        fail("unavailable", "Razorpay could not open this test checkout. Check that Test Mode keys and Route settings are valid, then retry.");
      }
      razorpayOrderId = entity.id;
      await database.runTransaction(async (tx) => {
        const orderRef = database.doc(`orders/${orderId}`);
        const mappingRef = database.doc(`razorpayOrders/${razorpayOrderId}`);
        const [current, mapping] = await Promise.all([tx.get(orderRef), tx.get(mappingRef)]);
        if (current.data()?.customerId !== uid || (current.data().razorpayOrderId && current.data().razorpayOrderId !== razorpayOrderId)
          || (mapping.exists && mapping.data()?.orderId !== orderId)) fail("failed-precondition", "The payment could not be matched to this order.");
        if (!mapping.exists) tx.create(mappingRef, { orderId });
        if (!current.data().razorpayOrderId) tx.update(orderRef, { razorpayOrderId, updatedAt: SERVER_TIMESTAMP });
      });
    }
    return { keyId: env.RAZORPAY_TEST_KEY_ID, orderId, razorpayOrderId, amount, storeName: order.storeName };
  }

  async function customerOrder(uid, orderId) {
    if (!attemptId(orderId)) fail("invalid-argument", "Invalid checkout attempt.");
    const order = await read(`orders/${orderId}`);
    if (order?.paymentMethod !== "razorpay" || order.customerId !== uid) fail("not-found", "Payment attempt not found.");
    return order;
  }

  async function recordCapture(orderId, payment) {
    const orderRef = database.doc(`orders/${orderId}`);
    return database.runTransaction(async (tx) => {
      const order = (await tx.get(orderRef)).data();
      if (!order || order.paymentMethod !== "razorpay" || order.paymentMode !== "test"
        || payment.order_id !== order.razorpayOrderId || payment.currency !== "INR" || payment.amount !== paise(order.totalAmount)) {
        fail("failed-precondition", "Razorpay payment does not match the order or amount.");
      }
      if (order.paymentStatus === "PAID") {
        if (order.paymentReference !== payment.id) fail("failed-precondition", "This order already has a different captured payment.");
        return { paid: true };
      }
      if (payment.status !== "captured" || payment.captured !== true || payment.amount_refunded !== 0) return { paid: false };
      tx.update(orderRef, {
        paymentStatus: "PAID", orderStatus: "PLACED", eta: "Razorpay test payment confirmed",
        paymentReference: payment.id, paymentVerifiedAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP,
      });
      return { paid: true, newlyPaid: true, sellerId: order.sellerId, orderId };
    });
  }

  async function verify(uid, input) {
    if (!configured) fail("unavailable", "Razorpay Test Mode is unavailable.");
    const order = await customerOrder(uid, input.orderId);
    if (!id(input.paymentId, "pay_") || !order.razorpayOrderId
      || !await validSignature(env.RAZORPAY_TEST_KEY_SECRET, `${order.razorpayOrderId}|${input.paymentId}`, input.signature)) {
      fail("permission-denied", "The Razorpay payment signature could not be verified.");
    }
    const payment = await api(`payments/${input.paymentId}`);
    if (!payment.ok || payment.data.id !== input.paymentId) fail("unavailable", "Razorpay is still verifying your payment. Check your order in a moment.");
    return recordCapture(input.orderId, payment.data);
  }

  async function status(uid, { orderId }) {
    if (!configured) fail("unavailable", "Razorpay Test Mode is unavailable.");
    const order = await customerOrder(uid, orderId);
    if (order.paymentStatus === "PAID" || !order.razorpayOrderId) return { paid: order.paymentStatus === "PAID" };
    const response = await api(`orders/${order.razorpayOrderId}/payments`);
    if (!response.ok) fail("unavailable", "Razorpay status is temporarily unavailable.");
    const payment = response.data.items?.find((item) => item.status === "captured" && id(item.id, "pay_"));
    return payment ? recordCapture(orderId, payment) : { paid: false };
  }

  async function transferStatus(uid, { orderId }) {
    if (!configured || !attemptId(orderId)) fail("not-found", "Test order not found.");
    const order = await read(`orders/${orderId}`);
    if (order?.paymentMethod !== "razorpay" || order.sellerId !== uid) fail("not-found", "Test order not found.");
    const store = await read(`stores/${order.storeId}`);
    if (store?.ownerId !== uid) fail("permission-denied", "This test order belongs to another store.");
    if (!order.razorpayRouteAccount) return { status: "unlinked" };
    if (order.paymentStatus !== "PAID") return { status: "pending" };
    const response = await api(`orders?receipt=${orderId}&expand%5B%5D=transfers`);
    if (!response.ok) fail("unavailable", "Razorpay Route status is temporarily unavailable.");
    const providerOrder = response.data.items?.find((item) => item.id === order.razorpayOrderId && item.receipt === orderId);
    const transfers = providerOrder?.transfers?.items ?? providerOrder?.transfers;
    const transfer = Array.isArray(transfers) ? transfers.find((item) => item.recipient === order.razorpayRouteAccount
      && item.amount === order.razorpayRouteAmount && item.currency === "INR") : null;
    const status = transfer?.transfer_status ?? transfer?.status;
    return { status: ["processed", "failed", "reversed", "partially_reversed"].includes(status) ? status : "pending" };
  }

  async function webhook(bytes, signature) {
    if (!configured) fail("unavailable", "Razorpay Test Mode is unavailable.");
    if (!await validSignature(env.RAZORPAY_TEST_WEBHOOK_SECRET, bytes, signature)) fail("permission-denied", "Invalid Razorpay webhook signature.");
    let event;
    try { event = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { fail("invalid-argument", "Invalid Razorpay event."); }
    if (event.event !== "payment.captured") return { received: true };
    const payment = event.payload?.payment?.entity;
    if (!id(payment?.id, "pay_") || !id(payment?.order_id, "order_")) fail("invalid-argument", "Invalid Razorpay payment details.");
    const mapping = await read(`razorpayOrders/${payment.order_id}`);
    if (!attemptId(mapping?.orderId)) return { received: true };
    const current = await api(`payments/${payment.id}`);
    if (!current.ok || current.data.id !== payment.id) fail("unavailable", "Razorpay payment status is unavailable.");
    if (current.data.status === "authorized") fail("unavailable", "Razorpay payment capture is still processing.");
    return { ...await recordCapture(mapping.orderId, current.data), received: true };
  }
  return { availability, start, verify, status, transferStatus, webhook };
}
