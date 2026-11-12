import type { AppLocation, FulfilmentMode, PartnerStore } from "./types";

export const freeDeliverySlots = ["first", "second"] as const;

export function distanceBetween(from: AppLocation, to: AppLocation) {
  const { latitude: fromLat, longitude: fromLng } = from;
  const { latitude: toLat, longitude: toLng } = to;
  if (fromLat == null || fromLng == null || toLat == null || toLng == null ||
      ![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return null;
  const radians = Math.PI / 180;
  const a = Math.sin((toLat - fromLat) * radians / 2) ** 2
    + Math.cos(fromLat * radians) * Math.cos(toLat * radians) * Math.sin((toLng - fromLng) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function sameDeliveryArea(customer: AppLocation, store: AppLocation) {
  if (!customer.address.trim() || !store.address.trim()) return false;
  const customerPin = customer.address.match(/\b[1-9]\d{5}\b/g)?.at(-1);
  const storePin = store.address.match(/\b[1-9]\d{5}\b/g)?.at(-1);
  if (customerPin && storePin) return customerPin === storePin;
  const distance = distanceBetween(customer, store);
  return distance !== null && distance <= 5;
}

export function occupiesDeliveryOffer(order: { fulfilment?: unknown; paymentStatus?: unknown }) {
  return order.fulfilment !== "pickup"
    && order.paymentStatus !== "PAYMENT_CANCELLED"
    && order.paymentStatus !== "PAYMENT_EXPIRED";
}

export const deliveryRates = [
  { limit: 5, range: "Up to 5 km", delivery: 49, garage: 59 },
  { limit: 10, range: "Over 5 to 10 km", delivery: 79, garage: 89 },
  { limit: Infinity, range: "Over 10 km", delivery: 99, garage: 99 },
] as const;

export function quoteDelivery(mode: FulfilmentMode, store: PartnerStore | undefined, address: AppLocation | undefined, free: boolean) {
  if (mode === "pickup") return { fee: 0, distance: null };
  if (!store || !address || address.address.trim().length < 10) {
    return { fee: null, distance: null, message: mode === "garage" ? "Add a garage with a full address in My Garage." : "Choose a full delivery address." };
  }
  const distance = distanceBetween(store.location, address);
  if (distance !== null && store.deliveryRadiusKm > 0 && distance > store.deliveryRadiusKm) {
    return { fee: null, distance, message: `This address is outside the store’s ${store.deliveryRadiusKm} km delivery range.` };
  }
  if (free) return { fee: 0, distance };
  if (distance === null) {
    return { fee: null, distance, message: store.location.latitude == null || store.location.longitude == null
      ? "The store needs a map pin to calculate delivery. You can choose self pickup."
      : "Select this address on the map to calculate delivery." };
  }
  const rate = deliveryRates.find((band) => distance <= band.limit)!;
  return { fee: rate[mode], distance };
}
