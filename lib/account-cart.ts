import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import type { CartLine } from "./types";
import type { CheckoutLine } from "./cart-checkout";

export type CartChange = (items: CartLine[]) => CartLine[];
export type CheckoutSnapshots = Record<string, CheckoutLine[]>;

export function readCartItems(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter((line): line is CartLine => Boolean(line && typeof line === "object"
    && line.product && typeof line.product.id === "string" && typeof line.product.name === "string"
    && typeof line.product.partNumber === "string" && Number.isInteger(line.quantity) && line.quantity > 0
    && Number.isFinite(line.product.price) && Number.isFinite(line.product.stock))).slice(0, 100);
}

export function readCheckoutSnapshots(value: unknown): CheckoutSnapshots {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, CheckoutLine[]] =>
    Array.isArray(entry[1]) && entry[1].every((line) => typeof line?.productId === "string"
      && typeof line.partNumber === "string" && Number.isInteger(line.quantity) && line.quantity > 0)).slice(-20));
}

function cleanItems(items: CartLine[]) {
  if (items.length > 100) throw new Error("Your cart can contain up to 100 different parts.");
  // Optional product fields must not become undefined Firestore values.
  return JSON.parse(JSON.stringify(items)) as CartLine[];
}

export async function initializeAccountCart(database: Firestore, uid: string, items: CartLine[], pendingCheckouts: CheckoutSnapshots) {
  const reference = doc(database, "users", uid, "preferences", "cart");
  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(reference);
    // An existing cloud cart is authoritative, including an intentionally empty cart.
    if (!snapshot.exists()) transaction.set(reference, {
      items: cleanItems(items), pendingCheckouts, appliedCheckouts: [], updatedAt: serverTimestamp(),
    });
  });
}

export async function updateAccountCart(database: Firestore, uid: string, change: CartChange, checkoutId?: string) {
  const reference = doc(database, "users", uid, "preferences", "cart");
  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    const applied: string[] = Array.isArray(data?.appliedCheckouts) ? data.appliedCheckouts : [];
    if (checkoutId && applied.includes(checkoutId)) return;
    const pendingCheckouts = readCheckoutSnapshots(data?.pendingCheckouts);
    if (checkoutId) delete pendingCheckouts[checkoutId];
    transaction.set(reference, {
      items: cleanItems(change(readCartItems(data?.items))),
      appliedCheckouts: checkoutId ? [...applied, checkoutId].slice(-200) : applied,
      pendingCheckouts,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function registerCartCheckout(database: Firestore, uid: string, orderId: string, items: CheckoutLine[]) {
  const reference = doc(database, "users", uid, "preferences", "cart");
  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    if (data?.appliedCheckouts?.includes(orderId)) return;
    const pendingCheckouts = readCheckoutSnapshots(data?.pendingCheckouts);
    if (pendingCheckouts[orderId]) return;
    if (Object.keys(pendingCheckouts).length >= 20) delete pendingCheckouts[Object.keys(pendingCheckouts)[0]];
    transaction.set(reference, {
      items: cleanItems(readCartItems(data?.items)), appliedCheckouts: data?.appliedCheckouts ?? [],
      pendingCheckouts: { ...pendingCheckouts, [orderId]: JSON.parse(JSON.stringify(items)) },
      updatedAt: serverTimestamp(),
    });
  });
}
