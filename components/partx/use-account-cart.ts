"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase";
import { initializeAccountCart, readCartItems, readCheckoutSnapshots, registerCartCheckout, updateAccountCart, type CartChange, type CheckoutSnapshots } from "@/lib/account-cart";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import type { CartLine } from "@/lib/types";
import type { CheckoutLine } from "@/lib/cart-checkout";

const emptyItems: CartLine[] = [];
const emptyCheckouts: CheckoutSnapshots = {};
const syncFailure = "Your cart could not sync. Check your connection and try again.";
type CartState = { uid: string; items: CartLine[]; pendingCheckouts: CheckoutSnapshots; ready: boolean; error: string };

function legacyCart() {
  try {
    const profile = JSON.parse(readBrowserStorage("local", "partx-firebase-profile-v1") ?? "null");
    return { uid: profile?.roles?.includes("customer") ? profile.id : null, items: readCartItems(JSON.parse(readBrowserStorage("local", "partx-cart-v1") ?? "[]")) };
  } catch { return { uid: null, items: emptyItems }; }
}

export function useAccountCart(uid: string | undefined) {
  const [legacy] = useState(legacyCart);
  const [state, setState] = useState<CartState | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    let initializing = false;
    const initialItems = legacy.uid === uid ? legacy.items : emptyItems;
    let initialCheckouts: CheckoutSnapshots = {};
    try { initialCheckouts = readCheckoutSnapshots(JSON.parse(readBrowserStorage("local", `partx-razorpay-cart:${uid}`) ?? "{}")); } catch {}
    const fail = () => { if (active) setState((current) => ({ uid, items: current?.uid === uid ? current.items : [], pendingCheckouts: {}, ready: false, error: syncFailure })); };
    const timeout = window.setTimeout(fail, 10000);
    const unsubscribe = onSnapshot(doc(firestore, "users", uid, "preferences", "cart"), { includeMetadataChanges: true }, (snapshot) => {
      if (!active) return;
      if (!snapshot.exists()) {
        if (snapshot.metadata.fromCache || initializing) return;
        initializing = true;
        void initializeAccountCart(firestore, uid, initialItems, initialCheckouts).catch(fail);
        return;
      }
      window.clearTimeout(timeout);
      const data = snapshot.data();
      const items = readCartItems(data.items);
      setState({ uid, items, pendingCheckouts: readCheckoutSnapshots(data.pendingCheckouts), ready: true, error: "" });
      removeBrowserStorage("local", "partx-cart-v1");
      writeBrowserStorage("local", `partx-cart-v2:${uid}`, JSON.stringify(items));
    }, fail);
    return () => { active = false; window.clearTimeout(timeout); unsubscribe(); };
  }, [uid, retry, legacy]);

  const current = uid && state?.uid === uid ? state : null;
  const save = useCallback(async (change: CartChange, checkoutId?: string) => {
    if (!uid || firebaseAuth.currentUser?.uid !== uid) throw new Error("Sign in to update your cart.");
    try { await updateAccountCart(firestore, uid, change, checkoutId); }
    catch (reason) {
      if (firebaseAuth.currentUser?.uid === uid) setState((previous) => previous?.uid === uid ? { ...previous, error: syncFailure } : previous);
      throw reason;
    }
  }, [uid]);
  const trackCheckout = useCallback(async (orderId: string, items: CheckoutLine[]) => {
    if (!uid || firebaseAuth.currentUser?.uid !== uid) throw new Error("Sign in to update your cart.");
    await registerCartCheckout(firestore, uid, orderId, items);
  }, [uid]);
  return {
    cart: current?.items ?? emptyItems,
    pendingCheckouts: current?.pendingCheckouts ?? emptyCheckouts,
    ready: current?.ready ?? false,
    error: current?.error ?? "",
    retry: () => setRetry((value) => value + 1),
    save, trackCheckout,
  };
}
