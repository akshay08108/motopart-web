import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoadRouter, RoutingError, routingPoint } from "../lib/road-routing.ts";
import { parsePostalOffices, appendPostalDetails } from "../lib/postal-address.ts";
import { quoteDelivery } from "../lib/delivery-pricing.ts";
import { createRouteQuote } from "../cloudflare/delivery-api/route-quote.js";
import { createRiderCore } from "../functions/rider-core.js";

const from = { latitude: 19.0596, longitude: 72.8295, address: "Store entrance, Bandra Mumbai 400050" };
const to = { latitude: 19.076, longitude: 72.8777, address: "Customer building, Mumbai 400051" };
const store = { name: "Test store", location: from, deliveryRadiusKm: 20 };
const summary = (distance, duration = 600) => Response.json({ routes: [{ summary: { distance, duration } }] });

test("postal lookup normalizes fields and rejects malformed or unsuccessful results", () => {
  const office = { Name: "Metpally", District: "Jagtial", State: "Telangana" };
  assert.deepEqual(parsePostalOffices([{ Status: "Success", PostOffice: [office, office, {}, { ...office, State: null }] }]), [{ name: "Metpally", district: "Jagtial", state: "Telangana" }]);
  assert.deepEqual(parsePostalOffices([{ Status: "Error", PostOffice: [office] }]), []);
  assert.deepEqual(parsePostalOffices(null), []);
});
test("postal details preserve house and street and can be changed without repeating suffixes", () => {
  const first = appendPostalDetails("1-6-84/4/A, Beedi colony", "505325", { name: "Metpally", district: "Jagtial", state: "Telangana" });
  assert.match(first.address, /^1-6-84\/4\/A, Beedi colony,/);
  const second = appendPostalDetails(first.address, "500001", { name: "Hyderabad GPO", district: "Hyderabad", state: "Telangana" }, first.suffix);
  assert.match(second.address, /500001$/); assert.doesNotMatch(second.address, /505325|Metpally/);
  assert.match(second.address, /1-6-84\/4\/A/);
});
test("routing sends longitude first, keeps key in header, and independently prices return road", async () => {
  const calls = [];
  const route = createRoadRouter("test-secret", async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.headers.Authorization, "test-secret");
    assert.equal(url.includes("test-secret"), false);
    return summary(calls.length === 1 ? 8782 : 8543);
  });
  const result = await route(from, to, true);
  assert.equal(result.distanceMeters, 8782); assert.equal(result.returnDistanceMeters, 8543);
  assert.deepEqual(JSON.parse(calls[0].init.body).coordinates, [[from.longitude, from.latitude], [to.longitude, to.latitude]]);
  assert.deepEqual(JSON.parse(calls[1].init.body).coordinates, [[to.longitude, to.latitude], [from.longitude, from.latitude]]);
  await Promise.all([route(from, to), route(from, to, true)]);
  assert.equal(calls.length, 2);
});
test("routing rejects missing pins, missing configuration, malformed distances and provider errors; failures can retry", async () => {
  assert.equal(routingPoint({ latitude: NaN, longitude: 0 }), false);
  await assert.rejects(createRoadRouter(undefined)(from, to), /not configured/);
  await assert.rejects(createRoadRouter("key")({}, to), /map pins/);
  let calls = 0;
  const route = createRoadRouter("key", async () => ++calls === 1 ? new Response("", { status: 429 }) : summary(5600));
  await assert.rejects(route(from, to), /busy/);
  assert.equal((await route(from, to)).distanceMeters, 5600);
  for (const bad of [-1, null, "500", Infinity]) await assert.rejects(createRoadRouter("key", async () => summary(bad))(from, to), RoutingError);
  await assert.rejects(createRoadRouter("key", async () => { throw new Error("socket timeout"); })(from, to), /timed out/);
});
test("road distance determines fee band and radius; pickup/free offers stay intact and no route is not zero", () => {
  assert.equal(quoteDelivery("delivery", store, to, false, 5.1).fee, 79);
  assert.equal(quoteDelivery("garage", store, to, false, 5).fee, 59);
  assert.equal(quoteDelivery("delivery", store, to, true, 5.1).fee, 0);
  assert.equal(quoteDelivery("pickup", undefined, undefined, false, null).fee, 0);
  assert.equal(quoteDelivery("delivery", store, to, true, 21).reason, "range");
  assert.equal(quoteDelivery("delivery", store, to, false, null).reason, "route");
});
function database(seed) {
  const docs = new Map(Object.entries(seed));
  const read = (path) => ({ exists: docs.has(path), data: () => docs.get(path) });
  return { docs, doc: (path) => ({ path, get: async () => read(path) }), runTransaction: (callback) => callback({
    get: async (ref) => read(ref.path), create: (ref, data) => docs.set(ref.path, data),
    update: (ref, data) => docs.set(ref.path, { ...docs.get(ref.path), ...data }),
  }) };
}
test("route quotes enforce seller ownership and reverse the route for returns", async () => {
  const db = database({ "users/seller": { roles: ["seller"], activeRole: "seller" }, "orders/order": { sellerId: "seller", storeId: "store", deliveryLocation: to }, "stores/store": { ownerId: "seller", location: from }, "orders/order/afterSales/0": { kind: "return", customerLocation: to } });
  const quote = createRouteQuote(db, async (a, b, back) => ({ a, b, back }));
  const result = await quote("seller", { orderId: "order", requestId: "0" });
  assert.equal(result.a, to); assert.equal(result.b, from); assert.equal(result.back, true);
  await assert.rejects(quote("other", { orderId: "order" }), (error) => error.code === "permission-denied");
  const longQuote = createRouteQuote(db, async () => ({distanceMeters:1405071}));
  await assert.rejects(longQuote("seller", {orderId:"order"}), (error) => error.code === "failed-precondition" && error.message.includes("1,405 km") && error.message.includes("store pickup pin"));
});
test("assignment recomputes road distances and ignores forged client kilometres and payout", async () => {
  const db = database({ "users/seller": { roles: ["seller"] }, "users/rider": { roles: ["rider"] }, "stores/store": { ownerId: "seller", location: from, name: "Parts" },
    "riders/rider": { active: true, online: true, lastSeenAt: { toMillis: () => Date.now() } },
    "orders/order": { sellerId: "seller", storeId: "store", customerId: "cx", fulfilment: "delivery", orderStatus: "PLACED", status: "Packed", paymentStatus: "PAYMENT_DUE", total: 199, deliveryLocation: to } });
  const core = createRiderCore(db, { randomUUID: () => "ride", serverTimestamp: () => 1, roadRoute: async () => ({ distanceMeters: 5000, returnDistanceMeters: 6000 }) });
  await core.dispatch("seller", { action: "assign", orderId: "order", riderId: "rider", oneWayDistanceKm: 999, amountPaise: 1 });
  const earning = db.docs.get("deliveries/ride").earnings;
  assert.equal(earning.amountPaise, 5500); assert.equal(earning.pricing.billableMeters, 11000); assert.equal(earning.pricing.source, "openrouteservice");
});

test("a valid 1,405 km route is a service-range issue, not invalid provider data", async () => {
  const route = await createRoadRouter("key", async () => summary(1405070.8, 60795.3))(from, to);
  assert.equal(route.distanceMeters, 1405071);
  const quote = quoteDelivery("delivery", {...store, deliveryRadiusKm:0}, to, true, route.distanceMeters / 1000);
  assert.equal(quote.fee,null);assert.equal(quote.reason,"range");
  assert.match(quote.message,/1,405 km/);assert.match(quote.message,/store pickup pin/);
  assert.doesNotMatch(quote.message,/invalid distance/);
});
