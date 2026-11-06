import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createRiderService } from "./rider-service.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Rider service tests require FIRESTORE_EMULATOR_HOST; production access is forbidden.");
const app = initializeApp({ projectId: "demo-partx-rider-service" }, "rider-tests");
const db = getFirestore(app);
const service = createRiderService(db);
const point = { address: "Hill Road, Bandra West, Mumbai 400050", latitude: 19.06, longitude: 72.83 };
const order = (extra = {}) => ({ customerId: "cx", sellerId: "seller", storeId: "store", storeName: "Test parts", customer: { name: "Customer", phone: "+919999999999" }, status: "Packed", stage: "Preparing", orderStatus: "PLACED", paymentStatus: "PAYMENT_DUE", paymentMethod: "cod", fulfilment: "delivery", totalAmount: 199, total: 199, deliveryLocation: point, items: [{ productName: "Filter", partNumber: "F1", quantity: 2 }, { productName: "Engine oil", partNumber: "E2", quantity: 1 }], ...extra });
const rejected = (promise, code) => assert.rejects(promise, (error) => error.code === code);

beforeEach(async () => {
  for (const collection of ["users", "riders", "stores", "orders", "deliveries", "deliverySecrets"]) await db.recursiveDelete(db.collection(collection));
  await Promise.all([
    db.doc("users/cx").set({ roles: ["customer"] }), db.doc("users/other-cx").set({ roles: ["customer"] }),
    db.doc("users/seller").set({ roles: ["seller"] }), db.doc("users/other-seller").set({ roles: ["seller"] }),
    db.doc("users/rider").set({ roles: ["rider"] }), db.doc("users/other-rider").set({ roles: ["rider"] }),
    db.doc("stores/store").set({ ownerId: "seller", name: "Test parts", location: point, phone: "+918888888888" }),
    db.doc("riders/rider").set({ name: "Rider", phone: "+917777777777", active: true, online: true, lastSeenAt: Timestamp.now(), activeDeliveryId: null }),
    db.doc("riders/other-rider").set({ name: "Other rider", active: true, online: true, lastSeenAt: Timestamp.now(), activeDeliveryId: null }),
    db.doc("orders/order").set(order()), db.doc("orders/order-2").set(order()),
  ]);
});
after(async () => { await db.terminate(); await deleteApp(app); });
const assign = () => service.dispatch("seller", { action: "assign", orderId: "order", riderId: "rider", oneWayDistanceKm: 5 });
async function pickup() {
  const { deliveryId } = await assign();
  await service.riderAction("rider", { action: "accept", deliveryId });
  await service.riderAction("rider", { action: "pickup", deliveryId });
  return deliveryId;
}

test("assignment validates identity, order owner, payment, fulfilment, addresses and presence", async () => {
  await rejected(service.dispatch(undefined, {}), "unauthenticated");
  await rejected(service.dispatch("cx", {}), "permission-denied");
  await rejected(service.dispatch("other-seller", { action: "assign", orderId: "order", riderId: "rider" }), "permission-denied");
  for (const change of [{ fulfilment: "pickup" }, { orderStatus: "PAYMENT_PENDING" }, { paymentStatus: "PENDING" }, { status: "Packing" }, { deliveryLocation: {} }]) {
    await db.doc("orders/order").set(order(change));
    await rejected(assign(), "failed-precondition");
  }
  await db.doc("orders/order").set(order());
  await db.doc("riders/rider").update({ lastSeenAt: Timestamp.fromMillis(Date.now() - 180000) });
  await rejected(assign(), "failed-precondition");
  assert.equal((await db.doc("riders/rider").get()).data().activeDeliveryId, null);
});

test("simultaneous sellers cannot reserve a rider for two orders", async () => {
  const results = await Promise.allSettled([assign(), service.dispatch("seller", { action: "assign", orderId: "order-2", riderId: "rider", oneWayDistanceKm: 5 })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await db.collection("deliveries").get()).size, 1);
});

test("earnings keep the assigned rate, accrue only on verified delivery and remain idempotent", async () => {
  await db.doc("riders/rider").update({ earningsPolicy: { amountPaise: 5000, payer: "store" } });
  const { deliveryId } = await assign();
  const ref = db.doc(`deliveries/${deliveryId}`);
  assert.deepEqual((await ref.get()).data().earnings, { amountPaise: 5000, currency: "INR", payer: "store", status: "PENDING_DELIVERY" });
  await db.doc("riders/rider").update({ earningsPolicy: { amountPaise: 9000, payer: "partx" } });
  await service.riderAction("rider", { action: "accept", deliveryId });
  await service.riderAction("rider", { action: "pickup", deliveryId });
  const { code } = await service.customerCode("cx", { deliveryId });
  await service.riderAction("rider", { action: "complete", deliveryId, code, codCollected: true });
  const earned = (await ref.get()).data().earnings;
  assert.equal(earned.amountPaise, 5000); assert.equal(earned.payer, "store"); assert.equal(earned.status, "EARNED"); assert.ok(earned.earnedAt.toMillis());
  await service.riderAction("rider", { action: "complete", deliveryId, code, codCollected: true });
  assert.equal((await ref.get()).data().earnings.earnedAt.toMillis(), earned.earnedAt.toMillis());
});

test("distance rates include return travel; invalid distances cannot assign and client rates are ignored", async () => {
  for (const oneWayDistanceKm of [undefined, 0, -1, "5", Infinity, 1001, 0.0001]) await rejected(service.dispatch("seller", { action: "assign", orderId: "order", riderId: "rider", oneWayDistanceKm }), "invalid-argument");
  const { deliveryId } = await service.dispatch("seller", { action: "assign", orderId: "order", riderId: "rider", oneWayDistanceKm: 5.125, ratePaisePerKm: 1, amountPaise: 1, payer: "store", returnIncluded: false });
  const earnings = (await db.doc(`deliveries/${deliveryId}`).get()).data().earnings;
  assert.equal(earnings.amountPaise, 5125); assert.equal(earnings.payer, "partx");
  assert.deepEqual(earnings.pricing, { mode: "per_km", ratePaisePerKm: 500, oneWayMeters: 5125, billableMeters: 10250, returnIncluded: true, source: "seller_entered" });
});

test("cancelled jobs do not earn and invalid policies cannot assign", async () => {
  const first = await assign();
  assert.equal((await db.doc(`deliveries/${first.deliveryId}`).get()).data().earnings.status, "PENDING_DELIVERY");
  await service.dispatch("seller", { action: "cancel", deliveryId: first.deliveryId, reason: "Customer changed their mind" });
  await db.doc("riders/rider").update({ earningsPolicy: { amountPaise: -100, payer: "store" } });
  await rejected(assign(), "failed-precondition");
  assert.equal((await db.doc("riders/rider").get()).data().activeDeliveryId, null);
  await db.doc("riders/rider").update({ earningsPolicy: { amountPaise: 5000, payer: "store" } });
  const second = await assign();
  await service.dispatch("seller", { action: "cancel", deliveryId: second.deliveryId, reason: "Customer changed their mind" });
  assert.equal((await db.doc(`deliveries/${second.deliveryId}`).get()).data().earnings.status, "PENDING_DELIVERY");
});

test("only the assigned rider can accept, pick up and complete with customer OTP and COD confirmation", async () => {
  const { deliveryId } = await assign();
  await rejected(service.riderAction("other-rider", { action: "accept", deliveryId }), "permission-denied");
  await rejected(service.riderAction("rider", { action: "pickup", deliveryId }), "failed-precondition");
  await rejected(service.customerCode("cx", { deliveryId }), "failed-precondition");
  await service.riderAction("rider", { action: "accept", deliveryId });
  await service.riderAction("rider", { action: "pickup", deliveryId });
  assert.equal((await db.doc("orders/order").get()).data().stage, "On the way");
  await rejected(service.customerCode("other-cx", { deliveryId }), "permission-denied");
  const { code } = await service.customerCode("cx", { deliveryId });
  assert.match(code, /^\d{6}$/);
  await rejected(service.riderAction("rider", { action: "complete", deliveryId, code }), "failed-precondition");
  await service.riderAction("rider", { action: "complete", deliveryId, code, codCollected: true });
  const delivered = (await db.doc("orders/order").get()).data();
  assert.equal((await db.doc(`deliveries/${deliveryId}`).get()).data().earnings.amountPaise, 5000);
  assert.equal(delivered.status, "Delivered"); assert.equal(delivered.codCollected, true);
  assert.equal(delivered.codCollectedBy, "rider"); assert.ok(delivered.deliveredAt.toMillis());
  assert.equal((await db.doc("riders/rider").get()).data().activeDeliveryId, null);
  assert.equal((await db.doc(`deliverySecrets/${deliveryId}`).get()).exists, false);
  await service.riderAction("rider", { action: "complete", deliveryId, code, codCollected: true });
  assert.equal((await db.doc("orders/order").get()).data().deliveredAt.toMillis(), delivered.deliveredAt.toMillis());
  await rejected(service.customerCode("cx", { deliveryId }), "failed-precondition");
});

test("wrong delivery codes commit attempt counters and lock after five failures", async () => {
  const deliveryId = await pickup(); const { code } = await service.customerCode("cx", { deliveryId });
  const wrong = code === "111111" ? "222222" : "111111";
  for (let index = 0; index < 5; index++) await rejected(service.riderAction("rider", { action: "complete", deliveryId, code: wrong, codCollected: true }), "invalid-argument");
  const secret = (await db.doc(`deliverySecrets/${deliveryId}`).get()).data();
  assert.equal(secret.attempts, 5); assert.ok(secret.lockedUntil.toMillis() > Date.now());
  await rejected(service.riderAction("rider", { action: "complete", deliveryId, code, codCollected: true }), "resource-exhausted");
  await rejected(service.customerCode("cx", { deliveryId }), "resource-exhausted");
  await db.doc(`deliverySecrets/${deliveryId}`).update({ lockedUntil: Timestamp.fromMillis(Date.now() - 1) });
  await service.customerCode("cx", { deliveryId });
  assert.equal((await db.doc(`deliverySecrets/${deliveryId}`).get()).data().attempts, 0);
  assert.equal((await db.doc("orders/order").get()).data().status, "Dispatched");
});

test("expired codes cannot complete delivery and can be renewed by their customer", async () => {
  const deliveryId = await pickup(); const { code } = await service.customerCode("cx", { deliveryId });
  await db.doc(`deliverySecrets/${deliveryId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 100) });
  await rejected(service.riderAction("rider", { action: "complete", deliveryId, code, codCollected: true }), "failed-precondition");
  const renewed = await service.customerCode("cx", { deliveryId });
  assert.ok(renewed.expiresAt > Date.now());
});

test("declines retain history, release the rider and permit a new assignment", async () => {
  const { deliveryId } = await assign();
  await service.riderAction("rider", { action: "decline", deliveryId, reason: "Vehicle unavailable" });
  const next = await assign(); assert.notEqual(next.deliveryId, deliveryId);
  assert.equal((await db.doc(`deliveries/${deliveryId}`).get()).data().state, "DECLINED");
  await rejected(service.riderAction("rider", { action: "accept", deliveryId }), "failed-precondition");
});

test("picked-up deliveries stay assigned on issues until the seller confirms a return", async () => {
  const deliveryId = await pickup();
  await rejected(service.dispatch("seller", { action: "cancel", deliveryId, reason: "Cancel delivery" }), "failed-precondition");
  await service.riderAction("rider", { action: "issue", deliveryId, reason: "Customer cannot be reached at this address" });
  assert.equal((await db.doc("riders/rider").get()).data().activeDeliveryId, deliveryId);
  await rejected(service.dispatch("other-seller", { action: "returned", deliveryId, reason: "Received parts" }), "permission-denied");
  await service.dispatch("seller", { action: "returned", deliveryId, reason: "All parts received back at store" });
  assert.equal((await db.doc(`deliveries/${deliveryId}`).get()).data().state, "RETURNED");
  assert.equal((await db.doc("orders/order").get()).data().status, "Packed");
  assert.equal((await db.doc("riders/rider").get()).data().activeDeliveryId, null);
  await assign();
});

test("cancelled assignments release riders and prepaid delivery requires no cash collection", async () => {
  const first = await assign();
  await service.dispatch("seller", { action: "cancel", deliveryId: first.deliveryId, reason: "Rider requested reassignment" });
  assert.equal((await db.doc(`deliveries/${first.deliveryId}`).get()).data().state, "CANCELLED");
  await db.doc("orders/order").set(order({ paymentStatus: "PAID", paymentMethod: "upi" }));
  const deliveryId = await pickup();
  assert.equal((await db.doc(`deliveries/${deliveryId}`).get()).data().codAmount, 0);
  const { code } = await service.customerCode("cx", { deliveryId });
  await service.riderAction("rider", { action: "complete", deliveryId, code });
  assert.equal((await db.doc("orders/order").get()).data().paymentStatus, "PAID");
});
