"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp, firebaseAuth, firestore } from "./firebase";

export type DeliveryState = "ASSIGNED" | "ACCEPTED" | "PICKED_UP" | "DELIVERED" | "DECLINED" | "CANCELLED" | "RETURNED";
export type DeliveryPoint = { address: string; latitude?: number; longitude?: number };
export type RiderEarningsPolicy = { mode: "per_km"; ratePaisePerKm: number; returnIncluded: boolean; payer: "store" | "partx" } | { mode?: "per_delivery"; amountPaise: number; payer: "store" | "partx" };
export type RiderEarning = { amountPaise: number; currency: "INR"; payer: "store" | "partx"; status: "PENDING_DELIVERY" | "EARNED" | "PAID"; earnedAt?: number; paidAt?: number; pricing?: { mode: "per_km"; ratePaisePerKm: number; oneWayMeters: number; billableMeters: number; returnIncluded: boolean; source: "seller_entered" } };
export type RiderProfile = { id: string; name: string; phone: string; active: boolean; online: boolean; activeDeliveryId?: string; lastSeenAt?: number; earningsPolicy?: RiderEarningsPolicy };
export type RiderDelivery = {
  id: string; orderId: string; trackingId?: string; pickupId?: string;
  kind?: "delivery" | "return" | "replacement"; requestId?: string; exchangeAt?: number;
  riderId: string; riderName: string; riderPhone: string;
  storeId: string; storeName: string; storePhone: string; customerId: string;
  customer: { name: string; phone: string }; pickup: DeliveryPoint; destination: DeliveryPoint;
  fulfilment: "delivery" | "garage"; state: DeliveryState; totalAmount: number; codAmount: number; codCollected: boolean;
  items: Array<{ name: string; partNumber: string; quantity: number; imageUrl?: string }>;
  assignedAt?: number; acceptedAt?: number; pickedUpAt?: number; deliveredAt?: number; closedAt?: number;
  issue?: { reason: string; reportedAt?: number }; closedReason?: string;
  earnings?: RiderEarning | null;
};
export type RiderPosition = { latitude: number; longitude: number; accuracy: number; updatedAt?: number };
export const deliveryLabels: Record<DeliveryState, string> = { ASSIGNED: "Waiting for acceptance", ACCEPTED: "Heading to pickup", PICKED_UP: "On the way", DELIVERED: "Delivered", DECLINED: "Rider declined", CANCELLED: "Assignment cancelled", RETURNED: "Returned to store" };
export const isActiveDelivery = (state: DeliveryState) => ["ASSIGNED", "ACCEPTED", "PICKED_UP"].includes(state);
export const timestampMillis = (value: unknown): number | undefined => {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return undefined;
};
export function deliveryDate(value?: number) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) + " IST" : "Time unavailable";
}
function parseDelivery(id: string, data: Record<string, unknown>) {
  const result = { ...data, id } as unknown as RiderDelivery;
  for (const key of ["assignedAt", "acceptedAt", "pickedUpAt", "deliveredAt", "closedAt", "exchangeAt"] as const) result[key] = timestampMillis(data[key]);
  if (data.earnings && typeof data.earnings === "object") {
    const earnings = data.earnings as Record<string, unknown>;
    result.earnings = { ...earnings, earnedAt: timestampMillis(earnings.earnedAt), paidAt: timestampMillis(earnings.paidAt) } as RiderEarning;
  }
  if (data.issue && typeof data.issue === "object") {
    const issue = data.issue as Record<string, unknown>;
    result.issue = { reason: String(issue.reason), reportedAt: timestampMillis(issue.reportedAt) };
  }
  return result;
}
export function useDelivery(deliveryId?: string, viewerId?: string) {
  const [delivery, setDelivery] = useState<RiderDelivery | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    queueMicrotask(() => { setDelivery(null); setError(""); });
    if (!deliveryId || !viewerId) return;
    return onSnapshot(doc(firestore, "deliveries", deliveryId), (snapshot) => setDelivery(snapshot.exists() ? parseDelivery(snapshot.id, snapshot.data()) : null), () => setError("Delivery details could not load. Check your connection and access."));
  }, [deliveryId, viewerId]);
  return { delivery, error };
}
export function useRiderJobs(userId?: string) {
  const [jobs, setJobs] = useState<RiderDelivery[]>([]);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    queueMicrotask(() => { setJobs([]); setProfile(null); setError(""); setLoaded(false); });
    if (!userId) return;
    const stopProfile = onSnapshot(doc(firestore, "riders", userId), (snapshot) => {
      const data = snapshot.data();
      setProfile(data ? { ...data, id: snapshot.id, lastSeenAt: timestampMillis(data.lastSeenAt) } as RiderProfile : null);
      setLoaded(true);
    }, () => { setError("Your rider account is unavailable. Contact PartX operations."); setLoaded(true); });
    const stopJobs = onSnapshot(query(collection(firestore, "deliveries"), where("riderId", "==", userId)), (snapshot) => {
      setJobs(snapshot.docs.map((item) => parseDelivery(item.id, item.data())).sort((a, b) => (b.assignedAt ?? 0) - (a.assignedAt ?? 0)));
    }, () => setError("Assignments could not load. Check your connection and try again."));
    return () => { stopProfile(); stopJobs(); };
  }, [userId]);
  return { jobs, profile, error, loaded };
}
export const rideTrackingId = (delivery: RiderDelivery) => delivery.trackingId ?? `PX-RIDE-${delivery.id}`;

export type AfterSaleRequest = {
  id: string;
  kind: "return" | "replacement";
  itemIndex: number;
  item: { productName: string; partNumber: string; quantity: number };
  state: "REQUESTED" | "ASSIGNED" | "COMPLETED";
  deliveryId?: string;
  reason: string;
};

export function useAfterSales(orderId: string, userId?: string) {
  const [result, setResult] = useState<{ key: string; requests: AfterSaleRequest[]; error?: string }>();
  const key = `${userId}:${orderId}`;
  useEffect(() => {
    if (!userId || !orderId) return;
    return onSnapshot(collection(firestore, "orders", orderId, "afterSales"),
      (snapshot) => setResult({ key, requests: snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as AfterSaleRequest) }),
      () => setResult({ key, requests: [], error: "Could not load return and replacement requests." }));
  }, [key, orderId, userId]);
  return result?.key === key ? result : { requests: [], error: undefined };
}

export async function deliveryCall<T = { ok: boolean }>(name: "dispatchPartXDelivery" | "updatePartXDelivery" | "getPartXDeliveryCode" | "requestPartXAfterSale", data: Record<string, unknown>): Promise<T> {
  const localFunctions = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1" && !process.env.NEXT_PUBLIC_PARTX_DELIVERY_API_URL;
  if (!localFunctions) {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Sign in before updating a delivery.");
    const base = (process.env.NEXT_PUBLIC_PARTX_DELIVERY_API_URL || "https://partx-delivery-api.akshaysinghkam.workers.dev").replace(/\/$/, "");
    if (!base.startsWith("https://") && !(process.env.NODE_ENV === "development" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))) throw new Error("A secure delivery API address is required.");
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${base}/${name}`, { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken(attempt === 1)}`, "Content-Type": "application/json" }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(30000) });
      } catch { throw new Error("Could not reach the delivery service. Check your connection and try again."); }
      if (response.status === 401 && attempt === 0) continue;
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.data || typeof payload.data !== "object") throw new Error(payload?.error?.message || "The delivery service is unavailable. Please try again or contact PartX support.");
      return payload.data as T;
    }
    throw new Error("Your session has expired. Sign in again.");
  }
  try {
    const result = await httpsCallable<Record<string, unknown>, T>(getFunctions(firebaseApp, "asia-south1"), name)(data);
    return result.data;
  } catch (reason) {
    const error = reason as { code?: string; message?: string };
    if (["functions/unavailable", "functions/internal", "functions/not-found"].includes(error.code ?? "")) throw new Error("The delivery service is unavailable. Please try again or contact PartX support.");
    throw new Error(error.message || "The delivery could not be updated. Please try again.");
  }
}
export function navigationLink(point: DeliveryPoint) {
  const destination = typeof point.latitude === "number" && typeof point.longitude === "number" ? `${point.latitude},${point.longitude}` : point.address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
export function phoneLink(phone: string) { return `tel:${phone.replace(/[^+0-9]/g, "")}`; }
