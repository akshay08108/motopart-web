import assert from "node:assert/strict";
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
  for (const name of ["users", "riders", "stores", "orders", "deliveries", "deliverySecrets", "notificationDevices"]) await db.recursiveDelete(db.collection(name));
  databaseRequests = 0; notifications = []; abortNextCommit = false; worker = createWorker({ fetcher: testFetch });
  const order = { customerId: "customer", sellerId: "seller", storeId: "store", customer: { name: "Customer", phone: "+919999999999" }, status: "Packed", stage: "Preparing", orderStatus: "PLACED", paymentStatus: "PAYMENT_DUE", paymentMethod: "cod", fulfilment: "delivery", totalAmount: 199, total: 199, deliveryLocation: point, items: [{ productName: "Filter", partNumber: "F1", quantity: 2 }, { productName: "Oil", partNumber: "O1", quantity: 1 }] };
  await Promise.all([
    ...[["seller", "seller"], ["rider", "rider"], ["other-rider", "rider"], ["customer", "customer"], ["other-customer", "customer"]].map(([id, role]) => db.doc(`users/${id}`).set({ roles: [role] })),
    db.doc("riders/rider").set({ active: true, online: true, name: "Rider", phone: "+918888888888", lastSeenAt: Timestamp.now(), activeDeliveryId: null }),
    db.doc("stores/store").set({ ownerId: "seller", name: "Test store", location: point }),
    db.doc("orders/order").set(order), db.doc("orders/other-order").set(order),
    ...["customer", "seller", "rider"].map((id) => db.doc(`notificationDevices/${id}`).set({ userId: id, token: `${id}-local-test-notification-token` })),
  ]);
});
after(async () => { await Promise.all(pending); await db.terminate(); await deleteApp(app); });
async function call(name, uid, data, extra = {}) {
  const response = await worker.fetch(new Request(`https://delivery.test/${name}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(uid ? { Authorization: `Bearer ${await token(uid, extra)}` } : {}) }, body: JSON.stringify({ data }) }), env, { waitUntil: (promise) => pending.push(promise) });
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
