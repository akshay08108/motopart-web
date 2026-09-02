import type { StorePaymentSettings } from "./types";

export const PAYMENT_EXPIRY_MINUTES = 15;
export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;
export const UTR_PATTERN = /^[A-Z0-9]{6,40}$/;

export function isValidUpiId(value: string) {
  return UPI_ID_PATTERN.test(value.trim());
}

export function normalizeUtr(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidUtr(value: string) {
  return UTR_PATTERN.test(normalizeUtr(value));
}

export function createUpiUri(input: { upiId: string; displayName: string; amount: number; orderId: string }) {
  if (!isValidUpiId(input.upiId)) throw new Error("This store has not configured a valid UPI ID.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("The payable amount is invalid.");
  const params = new URLSearchParams({
    pa: input.upiId.trim(),
    pn: input.displayName.trim(),
    am: input.amount.toFixed(2),
    cu: "INR",
    tn: `PartX Order ${input.orderId}`,
  });
  return `upi://pay?${params.toString()}`;
}

export function createPaymentOrderId(now = new Date(), random = Math.random) {
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("");
  const suffix = Math.floor(random() * 36 ** 5).toString(36).toUpperCase().padStart(5, "0");
  return `PRTX-${date}-${suffix}`;
}

export function paymentExpiresAt(now = Date.now()) {
  return new Date(now + PAYMENT_EXPIRY_MINUTES * 60_000);
}

export function developmentPaymentSettings(storeName: string): StorePaymentSettings | undefined {
  if (process.env.NODE_ENV !== "development" || storeName.trim().toLowerCase() !== "rk motors") return undefined;
  return { upiId: "9949415312@ybl", upiDisplayName: "RK Motors", upiEnabled: true, codEnabled: true };
}
