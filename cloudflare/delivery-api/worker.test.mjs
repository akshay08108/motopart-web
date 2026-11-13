import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import { createRequire } from "node:module";
import { createWorker } from "./worker.js";
import { createFirestoreRest } from "./firestore-rest.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Worker tests require the local Firestore emulator.");
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const projectId = "demo-partx-worker-rest";
const app = initializeApp({ projectId }, "worker-tests"); const db = getFirestore(app);
const point = { address: "Hill Road, Bandra West, Mumbai 400050", latitude: 19.06, longitude: 72.83 };
const origin = "https://motopart-web.vercel.app";
let privateKey, publicJwk, env, worker;
let gatewayOrder, gatewayPayment, gatewayTransfer, gatewayCreates;
let databaseRequests = 0; let notifications = []; let abortNextCommit = false;
const pending = [];

function b64(bytes) { return Buffer.from(bytes).toString("base64url"); }
async function token(uid, extra = {}, headerExtra = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: "RS256", kid: "local-test", typ: "JWT", ...headerExtra }));
  const payload = b64(JSON.stringify({ aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: uid, exp: now + 3600, iat: now, auth_time: now, ...extra }));
  const input = `${header}.${payload}`;
  return `${input}.${b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input)))}`;
}
async function testFetch(url, options = {}) {
  if (url === "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com") return Response.json({ keys: [publicJwk] }, { headers: { "cache-control": "max-age=3600" } });
  if (url === "https://oauth2.googleapis.com/token") {
    const claims = JSON.parse(Buffer.from(new URLSearchParams(options.body).get("assertion").split(".")[1], "base64url"));
    assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
    assert.ok(claims.scope.includes("auth/datastore"));
    return Response.json({ access_token: "owner", expires_in: 3600 });
  }
  if (url.startsWith("https://firestore.googleapis.com/v1/")) {
    databaseRequests++;
    if (abortNextCommit && url.endsWith(":commit")) { abortNextCommit = false; return Response.json({ error: { status: "ABORTED" } }, { status: 409 }); }
    return fetch(url.replace("https://firestore.googleapis.com", `http://${process.env.FIRESTORE_EMULATOR_HOST}`), options);
  }
  if (url.startsWith("https://fcm.googleapis.com/")) { notifications.push(JSON.parse(options.body)); return Response.json({ name: "test-message" }); }
  if (url.startsWith("https://api.razorpay.com/v1/")) {
    const path = new URL(url).pathname;
    assert.equal(options.headers.Authorization, "Basic " + Buffer.from("rzp_test_fixture:checkout-secret").toString("base64"));
    if (path === "/v1/orders" && options.method === "POST") {
      gatewayCreates++;
      if (gatewayOrder) return Response.json({ error: { description: "Duplicate request" } }, { status: 400 });
      const input = JSON.parse(options.body);
      gatewayOrder = { ...input, id: "order_fixture" };
      return Response.json(gatewayOrder);
    }
    if (path === "/v1/orders") return Response.json({ items: gatewayOrder ? [{ ...gatewayOrder, transfers: { items: gatewayTransfer ? [gatewayTransfer] : [] } }] : [] });
    if (path === "/v1/payments/pay_fixture") return Response.json(gatewayPayment);
    if (path === "/v1/orders/order_fixture/payments") return Response.json({ items: gatewayPayment ? [gatewayPayment] : [] });
  }
  throw new Error("Unexpected external request in Worker test");
}
before(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  privateKey = pair.privateKey;
  publicJwk = { ...await crypto.subtle.exportKey("jwk", pair.publicKey), kid: "local-test" };
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64")}\n-----END PRIVATE KEY-----\n`;
  env = { FIREBASE_PROJECT_ID: projectId, ALLOWED_ORIGINS: origin, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: projectId, client_email: `partx-delivery@${projectId}.iam.gserviceaccount.com`, private_key: pem }) };
});
beforeEach(async () => {
  await Promise.all(pending.splice(0));
  for (const name of ["users", "riders", "stores", "orders", "products", "razorpayOrders", "deliveries", "deliverySecrets", "notificationDevices"]) await db.recursiveDelete(db.collection(name));
  gatewayOrder = gatewayPayment = gatewayTransfer = null; gatewayCreates = 0;
  databaseRequests = 0; notifications = []; abortNextCommit = false; worker = createWorker({ fetcher: testFetch });
  const order = { customerId: "customer", sellerId: "seller", storeId: "store", customer: { name: "Customer", phone: "+919999999999" }, status: "Packed", stage: "Preparing", orderStatus: "PLACED", paymentStatus: "PAYMENT_DUE", paymentMethod: "cod", fulfilment: "delivery", totalAmount: 199, total: 199, deliveryLocation: point, items: [{ productName: "Filter", partNumber: "F1", quantity: 2 }, { productName: "Oil", partNumber: "O1", quantity: 1 }] };
  await Promise.all([
    ...[["seller", "seller"], ["rider", "rider"], ["other-rider", "rider"], ["customer", "customer"], ["other-customer", "customer"]].map(([id, role]) => db.doc(`users/${id}`).set({ roles: [role] })),
    db.doc("riders/rider").set({ active: true, online: true, name: "Rider", phone: "+918888888888", lastSeenAt: Timestamp.now(), activeDeliveryId: null, earningsPolicy: { amountPaise: 5000, payer: "store" } }),
    db.doc("stores/store").set({ ownerId: "seller", name: "Test store", location: point }),
    db.doc("orders/order").set(order), db.doc("orders/other-order").set(order),
    ...["customer", "seller", "rider"].map((id) => db.doc(`notificationDevices/${id}`).set({ userId: id, token: `${id}-local-test-notification-token` })),
  ]);
});
after(async () => { await Promise.all(pending); await db.terminate(); await deleteApp(app); });
async function call(name, uid, data, extra = {}, config = env) {
  const response = await worker.fetch(new Request(`https://delivery.test/${name}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(uid ? { Authorization: `Bearer ${await token(uid, extra)}` } : {}) }, body: JSON.stringify({ data }) }), config, { waitUntil: (promise) => pending.push(promise) });
  return { status: response.status, body: await response.json() };
}
async function assigned() {
  const response = await call("dispatchPartXDelivery", "seller", { action: "assign", orderId: "order", riderId: "rider" });
  assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.data.deliveryId;
}
async function pickedUp() {
  const deliveryId = await assigned();
  assert.equal((await call("updatePartXDelivery", "rider", { action: "accept", deliveryId })).status, 200);
  assert.equal((await call("updatePartXDelivery", "rider", { action: "pickup", deliveryId })).status, 200);
  return deliveryId;
}

test("HTTP boundary rejects missing, expired, forged and wrong-project tokens before database access", async () => {
  assert.equal((await call("dispatchPartXDelivery", null, {})).status, 401);
  for (const claims of [{ exp: 1 }, { aud: "other-project" }, { iss: "https://attacker.test" }, { auth_time: Math.floor(Date.now() / 1000) + 1000 }]) assert.equal((await call("dispatchPartXDelivery", "seller", {}, claims)).status, 401);
  const valid = await token("seller");
  const forged = `${valid.slice(0, valid.lastIndexOf(".") + 1)}${"A".repeat(342)}`;
  const response = await worker.fetch(new Request("https://delivery.test/dispatchPartXDelivery", { method: "POST", headers: { Authorization: `Bearer ${forged}`, "Content-Type": "application/json" }, body: "{}" }), env);
  assert.equal(response.status, 401); assert.equal(databaseRequests, 0);
});

test("health, CORS, methods and input limits fail safely without exposing credentials", async () => {
  const missing = await worker.fetch(new Request("https://delivery.test/health"), { ...env, FIREBASE_SERVICE_ACCOUNT: "" });
  assert.equal(missing.status, 503); assert.equal((await missing.json()).configuration, "required");
  const healthy = await worker.fetch(new Request("https://delivery.test/health", { headers: { Origin: origin } }), env);
  assert.equal(healthy.status, 200); assert.equal(healthy.headers.get("Access-Control-Allow-Origin"), origin);
  const preflight = await worker.fetch(new Request("https://delivery.test/updatePartXDelivery", { method: "OPTIONS", headers: { Origin: origin } }), env); assert.equal(preflight.status, 204);
  const blocked = await worker.fetch(new Request("https://delivery.test/health", { headers: { Origin: "https://attacker.test" } }), env); assert.equal(blocked.status, 403);
  assert.equal((await worker.fetch(new Request("https://delivery.test/dispatchPartXDelivery"), env)).status, 405);
  const huge = await call("dispatchPartXDelivery", "seller", { reason: "a".repeat(9000) }); assert.equal(huge.status, 400);
  assert.equal(databaseRequests, 0);
});

test("REST transactions deliver an order with OTP, exact server time, COD collection and notifications", async () => {
  const deliveryId = await pickedUp();
  const customerCode = await call("getPartXDeliveryCode", "customer", { deliveryId }); assert.equal(customerCode.status, 200);
  const { code } = customerCode.body.data;
  assert.equal((await call("getPartXDeliveryCode", "other-customer", { deliveryId })).status, 403);
  assert.equal((await call("updatePartXDelivery", "other-rider", { action: "complete", deliveryId, code, codCollected: true })).status, 403);
  assert.equal((await call("updatePartXDelivery", "rider", { action: "complete", deliveryId, code })).status, 409);
  assert.equal((await call("updatePartXDelivery", "rider", { action: "complete", deliveryId, code, codCollected: true })).status, 200);
  const order = (await db.doc("orders/order").get()).data(); const delivery = (await db.doc(`deliveries/${deliveryId}`).get()).data();
  assert.equal(order.stage, "Delivered"); assert.equal(order.codCollected, true);
  assert.ok(order.deliveredAt.toMillis() > Date.now() - 10000); assert.equal(order.deliveredAt.toMillis(), delivery.deliveredAt.toMillis());
  assert.equal((await db.doc("riders/rider").get()).data().activeDeliveryId, null);
  const earnings = (await db.doc(`deliveries/${deliveryId}`).get()).data().earnings;
  assert.equal(earnings.amountPaise, 5000); assert.equal(earnings.status, "EARNED"); assert.ok(earnings.earnedAt.toMillis());
  assert.equal((await db.doc(`deliverySecrets/${deliveryId}`).get()).exists, false);
  await Promise.all(pending.splice(0)); assert.ok(notifications.some((message) => message.message.token.startsWith("rider-")));
  assert.ok(notifications.some((message) => message.message.data.title.includes("delivered")));
  assert.ok(notifications.every((message) => !JSON.stringify(message).includes(code)));
});

test("REST retry handles aborted commits without partial or duplicate assignments", async () => {
  abortNextCommit = true; const deliveryId = await assigned();
  assert.equal((await db.collection("deliveries").get()).size, 1);
  assert.equal((await db.doc("riders/rider").get()).data().activeDeliveryId, deliveryId);
  assert.equal((await call("dispatchPartXDelivery", "seller", { action: "assign", orderId: "other-order", riderId: "rider" })).status, 409);
  assert.equal((await call("dispatchPartXDelivery", "customer", { action: "assign", orderId: "other-order", riderId: "rider" })).status, 403);
});

test("REST OTP failures persist the lockout; cancel and return delete private delivery state", async () => {
  const deliveryId = await pickedUp(); const response = await call("getPartXDeliveryCode", "customer", { deliveryId });
  const wrong = response.body.data.code === "111111" ? "222222" : "111111";
  for (let index = 0; index < 5; index++) assert.equal((await call("updatePartXDelivery", "rider", { action: "complete", deliveryId, code: wrong, codCollected: true })).status, 400);
  assert.equal((await db.doc(`deliverySecrets/${deliveryId}`).get()).data().attempts, 5);
  assert.equal((await call("updatePartXDelivery", "rider", { action: "complete", deliveryId, code: response.body.data.code, codCollected: true })).status, 429);
  await call("updatePartXDelivery", "rider", { action: "issue", deliveryId, reason: "Customer unavailable at this address" });
  assert.equal((await call("dispatchPartXDelivery", "seller", { action: "returned", deliveryId, reason: "All parts received back" })).status, 200);
  assert.equal((await db.doc("orders/order").get()).data().status, "Packed");
  assert.equal((await db.doc(`deliverySecrets/${deliveryId}`).get()).exists, false);
  const next = await assigned();
  assert.equal((await call("dispatchPartXDelivery", "seller", { action: "cancel", deliveryId: next, reason: "Rider unavailable now" })).status, 200);
});

test("concurrent REST assignment transactions reserve each rider once", async () => {
  const results = await Promise.all([call("dispatchPartXDelivery", "seller", { action: "assign", orderId: "order", riderId: "rider" }), call("dispatchPartXDelivery", "seller", { action: "assign", orderId: "other-order", riderId: "rider" })]);
  assert.equal(results.filter((response) => response.status === 200).length, 1);
  assert.equal((await db.collection("deliveries").get()).size, 1);
});

test("REST adapter preserves scalar, nested, array and timestamp fields", async () => {
  const adapter = createFirestoreRest({ projectId, accessToken: async () => "owner", fetcher: testFetch });
  const stored = (await adapter.doc("orders/order").get()).data();
  assert.equal(stored.items[0].quantity, 2); assert.equal(stored.deliveryLocation.latitude, 19.06);
  assert.equal((await adapter.doc("orders/missing").get()).exists, false);
});


test("a verified customer can request a return and an exchange, each with its own ride and matching earnings", async () => {
  const originalDelivery = await pickedUp();
  const originalCode = (await call("getPartXDeliveryCode", "customer", { deliveryId: originalDelivery })).body.data.code;
  assert.equal((await call("updatePartXDelivery", "rider", { action: "complete", deliveryId: originalDelivery, code: originalCode, codCollected: true })).status, 200);
  const orderRef = db.doc("orders/order");
  const originalOrder = (await orderRef.get()).data();
  await orderRef.update({ items: [{ ...originalOrder.items[0], returnable: true }, { ...originalOrder.items[1], replaceable: true }] });
  const tracking = new Set([(await db.doc(`deliveries/${originalDelivery}`).get()).data().trackingId]);
  const create = (kind, itemIndex, verified = true, user = "customer") =>
    call("requestPartXAfterSale", user, { orderId: "order", itemIndex, kind, reason: "Wrong fitment" }, { email_verified: verified });
  assert.equal((await create("return", 0, false)).status, 403);
  assert.equal((await create("return", 0, true, "other-customer")).status, 403);
  assert.equal((await create("replacement", 0)).status, 409);
  await orderRef.update({ deliveredAt: Timestamp.fromMillis(Date.now() - 49 * 3600000) });
  assert.equal((await create("return", 0)).status, 409);
  await orderRef.update({ deliveredAt: originalOrder.deliveredAt });

  for (const [index, kind] of ["return", "replacement"].entries()) {
    const requested = await create(kind, index);
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    const requestId = requested.body.data.requestId;
    assert.equal((await create(kind, index)).body.data.requestId, requestId);
    const assignment = await call("dispatchPartXDelivery", "seller", { action: "assign", orderId: "order", riderId: "rider", requestId });
    assert.equal(assignment.status, 200, JSON.stringify(assignment.body));
    const deliveryId = assignment.body.data.deliveryId;
    const rideRef = db.doc(`deliveries/${deliveryId}`);
    const ride = (await rideRef.get()).data();
    assert.equal(ride.kind, kind);
    assert.equal(ride.codAmount, 0);
    assert.equal(ride.earnings.amountPaise, 5000);
    assert.ok(!tracking.has(ride.trackingId));
    tracking.add(ride.trackingId);
    const act = (action, more = {}) => call("updatePartXDelivery", "rider", { deliveryId, action, ...more });
    const getCode = (user, storeReceipt = false) => call("getPartXDeliveryCode", user, { deliveryId, storeReceipt });
    assert.equal((await act("accept")).status, 200);
    if (kind === "return") {
      const code = (await getCode("customer")).body.data.code;
      assert.equal((await act("pickup", { code })).status, 200);
    } else {
      assert.notEqual(ride.pickupId, ride.trackingId);
      assert.ok(ride.pickupId.startsWith("PX-PICKUP-"));
      assert.equal((await act("pickup")).status, 200);
      const code = (await getCode("customer")).body.data.code;
      assert.equal((await act("complete", { code })).status, 409);
      assert.equal((await act("exchange", { code, handoverConfirmed: true })).status, 200);
    }
    assert.equal((await getCode("customer")).status, 409);
    const receipt = await getCode("seller", true);
    assert.equal(receipt.status, 200, JSON.stringify(receipt.body));
    assert.equal((await act("complete", { code: receipt.body.data.code })).status, 200);
    assert.equal((await rideRef.get()).data().earnings.status, "EARNED");
    assert.equal((await orderRef.collection("afterSales").doc(requestId).get()).data().state, "COMPLETED");
    assert.equal((await orderRef.get()).data().riderDeliveryId, originalDelivery);
    assert.equal((await orderRef.get()).data().deliveredAt.toMillis(), originalOrder.deliveredAt.toMillis());
  }
  assert.equal(tracking.size, 3);
});

const checkoutId = "PX-TEST-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const signed = (secret, value) => createHmac("sha256", secret).update(value).digest("hex");

test("Razorpay Test Mode prices from Firestore, verifies capture once, alerts the seller and dispatches without COD or earnings", async () => {
  const config = { ...env, RAZORPAY_TEST_KEY_ID: "rzp_test_fixture", RAZORPAY_TEST_KEY_SECRET: "checkout-secret",
    RAZORPAY_TEST_WEBHOOK_SECRET: "webhook-secret", RAZORPAY_TEST_CUSTOMERS: "customer", RAZORPAY_TEST_STORES: "store",
    RAZORPAY_TEST_LINKED_ACCOUNTS: '{"store":"acc_fixture"}' };
  await Promise.all([
    db.doc("users/customer").update({ activeRole: "customer" }),
    db.doc("orders/order").update({ deliveryPricingV1: true }),
    db.doc("orders/other-order").update({ deliveryPricingV1: true }),
    db.doc("users/customer/deliveryLocations/default").set(point),
    db.doc("stores/store").update({ status: "approved" }),
    db.doc("products/filter").set({ name: "Filter", partNumber: "F1", storeId: "store", sellerId: "seller", status: "published", stock: 5, sellingPrice: 249.95 }),
  ]);
  const invoke = (name, uid, data, verified = true) => call(name, uid, data, { email_verified: verified }, config);
  const begin = { orderId: checkoutId, storeId: "store", fulfilment: "delivery", items: [{ productId: "filter", quantity: 2 }], expectedAmount: 49990 };
  assert.deepEqual((await invoke("razorpayAvailability", "seller", { storeId: "store" })).body.data, { enabled: true, route: true });
  assert.equal((await invoke("razorpayAvailability", "other-customer", { storeId: "store" })).body.data.enabled, false);
  assert.equal((await invoke("razorpayCreateOrder", "customer", begin, false)).status, 403);
  assert.equal((await invoke("razorpayCreateOrder", "other-customer", begin)).status, 403);
  assert.equal((await invoke("razorpayCreateOrder", "customer", { ...begin, expectedAmount: 100 })).status, 409);
  assert.equal((await invoke("razorpayCreateOrder", "customer", { ...begin, items: [{ productId: "filter", quantity: 6 }] })).status, 409);
  const start = await invoke("razorpayCreateOrder", "customer", begin);
  assert.equal(start.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.data.amount, 49990);
  assert.deepEqual(gatewayOrder.transfers, [{ account: "acc_fixture", amount: 49990, currency: "INR" }]);
  assert.equal((await invoke("razorpayCreateOrder", "customer", begin)).body.data.razorpayOrderId, "order_fixture");
  assert.equal(gatewayCreates, 1);
  const ref = db.doc(`orders/${checkoutId}`);
  assert.equal((await ref.get()).data().orderStatus, "PAYMENT_PENDING");
  assert.equal((await db.doc("users/customer/deliveryOffer/first").get()).exists, false);
  const verify = { orderId: checkoutId, paymentId: "pay_fixture", signature: signed("checkout-secret", "order_fixture|pay_fixture") };
  assert.equal((await invoke("razorpayVerify", "customer", { ...verify, signature: "0".repeat(64) })).status, 403);
  assert.equal((await invoke("razorpayVerify", "other-customer", verify)).status, 404);
  gatewayPayment = { id: "pay_fixture", order_id: "order_fixture", currency: "INR", amount: 49990, amount_refunded: 0, captured: false, status: "authorized" };
  assert.deepEqual((await invoke("razorpayVerify", "customer", verify)).body.data, { paid: false });
  gatewayPayment = { ...gatewayPayment, captured: true, status: "captured", amount: 100 };
  assert.equal((await invoke("razorpayVerify", "customer", verify)).status, 409);
  gatewayPayment.amount = 49990;
  const event = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: gatewayPayment } } });
  const webhook = (signature) => worker.fetch(new Request("https://delivery.test/razorpayWebhook", {
    method: "POST", headers: { "X-Razorpay-Signature": signature }, body: event,
  }), config, { waitUntil: (promise) => pending.push(promise) });
  assert.equal((await webhook("0".repeat(64))).status, 403);
  const signature = signed("webhook-secret", event);
  assert.equal((await webhook(signature)).status, 200);
  assert.equal((await webhook(signature)).status, 200);
  assert.deepEqual((await invoke("razorpayVerify", "customer", verify)).body.data, { paid: true });
  assert.equal((await ref.get()).data().orderStatus, "PLACED");
  assert.equal((await db.doc("products/filter").get()).data().stock, 5);
  await Promise.all(pending.splice(0));
  assert.equal(notifications.filter((item) => item.message.data.title === "Razorpay test order ready to pack").length, 1);

  gatewayTransfer = { id: "trf_fixture", recipient: "acc_fixture", amount: 49990, currency: "INR", status: "processed" };
  assert.deepEqual((await invoke("razorpayTransferStatus", "seller", { orderId: checkoutId })).body.data, { status: "processed" });
  assert.equal((await invoke("razorpayTransferStatus", "other-customer", { orderId: checkoutId })).status, 404);
  await ref.update({ status: "Packed", stage: "Preparing" });
  const assignment = await call("dispatchPartXDelivery", "seller", { action: "assign", orderId: checkoutId, riderId: "rider" });
  assert.equal(assignment.status, 200, JSON.stringify(assignment.body));
  const deliveryId = assignment.body.data.deliveryId;
  const deliveryRef = db.doc(`deliveries/${deliveryId}`);
  const job = (await deliveryRef.get()).data();
  assert.equal(job.razorpayTest, true);
  assert.equal(job.codAmount, 0);
  assert.equal(job.earnings, null);
  assert.equal((await call("updatePartXDelivery", "rider", { action: "accept", deliveryId })).status, 200);
  assert.equal((await call("updatePartXDelivery", "rider", { action: "pickup", deliveryId })).status, 200);
  const { code } = (await call("getPartXDeliveryCode", "customer", { deliveryId })).body.data;
  assert.equal((await call("updatePartXDelivery", "rider", { action: "complete", deliveryId, code })).status, 200);
  assert.equal((await deliveryRef.get()).data().earnings, null);
  assert.equal((await ref.get()).data().stage, "Delivered");
});
