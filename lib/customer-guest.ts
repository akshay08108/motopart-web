import type { CartLine } from "./types";

export const guestCartLimit = 100;

export function canBrowseAsGuest(pathname: string) {
  return pathname === "/" || pathname === "/shop" || pathname.startsWith("/shop/")
    || pathname === "/product" || pathname === "/cart" || pathname === "/offers";
}

export function isGuestAccountPage(pathname: string) {
  return ["/account", "/garage", "/checkout", "/order", "/orders", "/support"].includes(pathname)
    || pathname.startsWith("/orders/");
}

// An existing account keeps its seller and never gets duplicate quantities on retries.
export function mergeGuestCart(accountItems: CartLine[], guestItems: CartLine[]) {
  const merged = [...accountItems];
  for (const guest of guestItems) {
    const partNumber = guest.product.partNumber.trim().toLowerCase();
    const index = merged.findIndex(({ product }) => product.id === guest.product.id
      || (partNumber !== "" && product.partNumber.trim().toLowerCase() === partNumber));
    if (index < 0) {
      if (merged.length < guestCartLimit) merged.push(guest);
      continue;
    }
    const existing = merged[index];
    if (existing.storeId !== guest.storeId) continue;
    const quantity = Math.max(existing.quantity, guest.quantity);
    if (quantity !== existing.quantity) merged[index] = { ...existing, quantity };
  }
  return merged;
}
