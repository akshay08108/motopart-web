import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultRiderEarningsPolicy, distanceEarningQuote, earningsSummary, inEarningsPeriod, recordedEarning } from "../lib/rider-earnings.ts";
import { defaultRiderEarningsPolicy as serverPolicy } from "../functions/rider-core.js";

const now = Date.parse("2026-11-06T00:15:00+05:30");
const delivery = (id, extra = {}) => ({ id, state: "DELIVERED", deliveredAt: now - 60000, codAmount: 1050, codCollected: true, earnings: { amountPaise: 5000, currency: "INR", payer: "store", status: "EARNED" }, ...extra });
test("displayed distance policy matches the server and includes the paid return", () => {
  assert.deepEqual(defaultRiderEarningsPolicy, serverPolicy);
  assert.deepEqual(distanceEarningQuote(defaultRiderEarningsPolicy, 5), { amountPaise: 5000, oneWayMeters: 5000, billableMeters: 10000 });
  assert.deepEqual(distanceEarningQuote(defaultRiderEarningsPolicy, 3.257), { amountPaise: 3257, oneWayMeters: 3257, billableMeters: 6514 });
  assert.equal(distanceEarningQuote(defaultRiderEarningsPolicy, 0), null);
});
test("only completed recorded earnings count; COD is kept separate", () => {
  const jobs = [delivery("earned"), delivery("paid", { earnings: { amountPaise: 7500, currency: "INR", payer: "partx", status: "PAID", paidAt: now } }), delivery("active", { state: "PICKED_UP" }), delivery("cancelled", { state: "CANCELLED" }), delivery("missing", { earnings: null })];
  const result = earningsSummary(jobs, "all", now);
  assert.equal(result.completed.length, 3);
  assert.equal(result.earnedPaise, 12500);
  assert.equal(result.paidPaise, 7500);
  assert.equal(result.pendingPaise, 5000);
  assert.equal(result.unrecorded, 1);
  assert.equal(result.codPaise, 315000);
});
test("IST date filters handle midnight, month boundaries and the inclusive seven-day window", () => {
  assert.equal(inEarningsPeriod(Date.parse("2026-11-05T18:40:00Z"), "today", now), true);
  assert.equal(inEarningsPeriod(Date.parse("2026-11-05T18:29:00Z"), "today", now), false);
  assert.equal(inEarningsPeriod(Date.parse("2026-10-31T00:00:00+05:30"), "week", now), true);
  assert.equal(inEarningsPeriod(Date.parse("2026-10-30T23:59:59+05:30"), "week", now), false);
  assert.equal(inEarningsPeriod(Date.parse("2026-10-31T18:30:00Z"), "month", now), true);
  assert.equal(inEarningsPeriod(Date.parse("2026-10-31T18:29:59Z"), "month", now), false);
  assert.equal(inEarningsPeriod(undefined, "today", now), false);
  assert.equal(inEarningsPeriod(now + 1000, "today", now), false);
});
test("unconfirmed payouts stay pending and historical missing rates are never backfilled", () => {
  const result = earningsSummary([delivery("no-confirmation", { earnings: { amountPaise: 5000, currency: "INR", payer: "store", status: "PAID" } }), delivery("legacy", { earnings: undefined })], "all", now);
  assert.equal(result.paidPaise, 0);
  assert.equal(result.pendingPaise, 5000);
  assert.equal(result.unrecorded, 1);
  for (const earnings of [{ amountPaise: -1 }, { amountPaise: 10.5 }, { amountPaise: "5000" }, { currency: "USD" }, { status: "PENDING_DELIVERY" }]) assert.equal(recordedEarning(delivery("invalid", { earnings: { ...delivery("base").earnings, ...earnings } })), null);
});
