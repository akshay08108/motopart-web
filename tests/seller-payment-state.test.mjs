import assert from "node:assert/strict";
import { test } from "node:test";
import { isRemovedPayment } from "../lib/seller-payment-state.ts";
test("only the removed failed attempt is hidden; corrected submissions and paid entries remain visible", () => {
  const failed = { paymentStatus: "VERIFICATION_FAILED", paymentSubmittedAtMillis: 1000, paymentArchivedAt: new Date(2000) };
  assert.equal(isRemovedPayment(failed), true);
  assert.equal(isRemovedPayment({ ...failed, paymentArchivedAt: undefined }), false);
  assert.equal(isRemovedPayment({ ...failed, paymentSubmittedAtMillis: 3000 }), false);
  assert.equal(isRemovedPayment({ ...failed, paymentStatus: "PAYMENT_SUBMITTED" }), false);
  assert.equal(isRemovedPayment({ ...failed, paymentStatus: "PAID" }), false);
});
