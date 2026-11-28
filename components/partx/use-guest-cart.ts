"use client";

import { useCallback, useRef, useState } from "react";
import { readCartItems, type CartChange } from "@/lib/account-cart";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { guestCartLimit } from "@/lib/customer-guest";
import type { CartLine } from "@/lib/types";

const key = "partx-guest-cart-v1";
const sessionIdKey = "partx-guest-session-id";

export function useGuestCart() {
  const [items, setItems] = useState<CartLine[] | null>(null);
  const current = useRef<CartLine[] | null>(null);
  const guestSessionId = useRef<string | null>(null);

  const persist = useCallback((next: CartLine[] | null) => {
    current.current = next;
    setItems(next);
    if (next) writeBrowserStorage("session", key, JSON.stringify(next));
    else removeBrowserStorage("session", key);
  }, []);

  const restore = useCallback(() => {
    const saved = readBrowserStorage("session", key);
    if (saved === null) return;
    try {
      persist(readCartItems(JSON.parse(saved)));
      guestSessionId.current = readBrowserStorage("session", sessionIdKey);
    }
    catch { removeBrowserStorage("session", key); }
  }, [persist]);

  const start = useCallback(() => {
    persist(current.current ?? []);
    guestSessionId.current ??= crypto.randomUUID();
    writeBrowserStorage("session", sessionIdKey, guestSessionId.current);
    return guestSessionId.current;
  }, [persist]);

  const clear = useCallback(() => {
    persist(null);
    guestSessionId.current = null;
    removeBrowserStorage("session", sessionIdKey);
  }, [persist]);
  const save = useCallback(async (change: CartChange) => {
    if (!current.current) throw new Error("Continue as a guest to update this cart.");
    const next = change(current.current);
    if (next.length > guestCartLimit) throw new Error("Your cart can contain up to 100 different parts.");
    persist(next);
  }, [persist]);

  return { items, restore, start, clear, save };
}
