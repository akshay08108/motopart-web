import type { SellerOrder } from "./types";

export function isRemovedPayment(order: SellerOrder) {
  return order.paymentStatus === "VERIFICATION_FAILED"
    && order.paymentArchivedAt instanceof Date
    && Number.isFinite(order.paymentArchivedAt.getTime())
    && order.paymentArchivedAt.getTime() >= (order.paymentSubmittedAtMillis ?? 0);
}
