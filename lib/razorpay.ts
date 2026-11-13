"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import { useEffect, useState } from "react";
import { firebaseAuth } from "./firebase";

type Availability = { enabled: boolean; route?: boolean };
export type RazorpayTransferStatus = "unlinked" | "pending" | "processed" | "failed" | "reversed" | "partially_reversed";
type Confirmation = { paid: boolean };
type Checkout = { keyId: string; orderId: string; razorpayOrderId: string; amount: number; storeName: string; paid?: false } | { orderId: string; paid: true };
type CheckoutSuccess = { razorpay_payment_id: string; razorpay_signature: string };
type CheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  handler: (result: CheckoutSuccess) => void;
  modal: { ondismiss: () => void };
};
type RazorpayConstructor = new (options: CheckoutOptions) => { open: () => void };
type RazorpayWindow = Window & { Razorpay?: RazorpayConstructor };
const nativeCheckout = registerPlugin<{ open: (options: Omit<CheckoutOptions, "handler" | "modal">) => Promise<Partial<CheckoutSuccess>> }>("PartXRazorpay");
let scriptPromise: Promise<RazorpayConstructor> | undefined;

async function paymentCall<T>(name: string, data: object): Promise<T> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Sign in to use Razorpay.");
  const base = (process.env.NEXT_PUBLIC_PARTX_DELIVERY_API_URL || "https://partx-delivery-api.akshaysinghkam.workers.dev").replace(/\/$/, "");
  if (!base.startsWith("https://") && !(process.env.NODE_ENV === "development" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))) {
    throw new Error("A secure payment API address is required.");
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${base}/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await user.getIdToken(attempt === 1)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(35000),
    });
    if (response.status === 401 && attempt === 0) continue;
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data) throw new Error(payload?.error?.message || "Razorpay is temporarily unavailable.");
    return payload.data as T;
  }
  throw new Error("Your session has expired. Sign in again.");
}

export function useRazorpayAvailability(storeId?: string, userId?: string) {
  const key = storeId && userId ? JSON.stringify([storeId, userId]) : "";
  const [result, setResult] = useState<{ key: string; data: Availability }>();
  useEffect(() => {
    if (!key || !storeId) return;
    let active = true;
    void paymentCall<Availability>("razorpayAvailability", { storeId }).then(
      (data) => { if (active) setResult({ key, data }); },
      () => { if (active) setResult({ key, data: { enabled: false } }); },
    );
    return () => { active = false; };
  }, [key, storeId]);
  return result?.key === key ? result.data : undefined;
}

export function checkRazorpayPayment(orderId: string) {
  return paymentCall<Confirmation>("razorpayStatus", { orderId });
}

export function checkRazorpayTransfer(orderId: string) {
  return paymentCall<{ status: RazorpayTransferStatus }>("razorpayTransferStatus", { orderId });
}

function loadCheckout() {
  const checkoutWindow = window as RazorpayWindow;
  if (checkoutWindow.Razorpay) return Promise.resolve(checkoutWindow.Razorpay);
  scriptPromise ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    const failed = () => {
      window.clearTimeout(timeout);
      script.remove();
      scriptPromise = undefined;
      reject(new Error("Razorpay Checkout could not load. Check your connection and try again."));
    };
    const timeout = window.setTimeout(failed, 12000);
    script.onerror = failed;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (checkoutWindow.Razorpay) resolve(checkoutWindow.Razorpay);
      else failed();
    };
    document.head.append(script);
  });
  return scriptPromise;
}

export async function openRazorpayCheckout(data: { orderId: string; storeId: string; fulfilment: string; expectedAmount: number; items: { productId: string; quantity: number }[] } | { orderId: string; resume: true }) {
  const isAndroid = Capacitor.getPlatform() === "android";
  if (isAndroid && !Capacitor.isPluginAvailable("PartXRazorpay")) throw new Error("Update the PartX Android app or use PartX in your mobile browser to test Razorpay.");
  const Razorpay = isAndroid ? null : await loadCheckout();
  const checkout = await paymentCall<Checkout>("razorpayCreateOrder", data);
  if (checkout.paid) return { paid: true, orderId: checkout.orderId };
  const options = {
    key: checkout.keyId, order_id: checkout.razorpayOrderId, amount: checkout.amount, currency: "INR" as const,
    name: "PartX", description: `Test order · ${checkout.storeName}`,
  };
  const pending = { paid: false, orderId: checkout.orderId };
  const confirm = async ({ razorpay_payment_id, razorpay_signature }: Partial<CheckoutSuccess>) => {
    try {
      const { paid } = razorpay_payment_id && razorpay_signature
        ? await paymentCall<Confirmation>("razorpayVerify", { orderId: checkout.orderId, paymentId: razorpay_payment_id, signature: razorpay_signature })
        : await checkRazorpayPayment(checkout.orderId);
      return { paid, orderId: checkout.orderId };
    } catch {
      return pending;
    }
  };
  if (!Razorpay) return confirm(await nativeCheckout.open(options));
  return new Promise<{ paid: boolean; orderId: string }>((resolve, reject) => {
    let submitted = false;
    const instance = new Razorpay({
      ...options,
      handler: (result) => {
        submitted = true;
        void confirm(result).then(resolve);
      },
      modal: { ondismiss: () => { if (!submitted) resolve(pending); } },
    });
    try { instance.open(); } catch { reject(new Error("Razorpay Checkout could not open. Try again.")); }
  });
}
