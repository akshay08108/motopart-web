"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";

export function CartFeedback() {
  const { cartNotice, dismissCartNotice } = usePartX();
  useEffect(() => {
    if (!cartNotice) return;
    const timer = window.setTimeout(() => dismissCartNotice(cartNotice.id), Math.max(0, cartNotice.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [cartNotice, dismissCartNotice]);
  if (!cartNotice) return null;
  return <div className="px-cart-toast" key={cartNotice.id} role="status" aria-live="polite" aria-atomic="true"><span className="px-cart-toast-icon"><Icon name={cartNotice.added ? "check" : "cart"}/></span><div><b>{cartNotice.message}</b><span>{cartNotice.productName}</span></div><Link href="/cart" onClick={() => dismissCartNotice(cartNotice.id)}>View cart</Link><button type="button" aria-label="Dismiss cart notification" onClick={() => dismissCartNotice(cartNotice.id)}><Icon name="close"/></button></div>;
}
