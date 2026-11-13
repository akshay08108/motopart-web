"use client";

import Image from "next/image";
import Link from "next/link";
import { usePartX } from "./app-provider";
import { productHref } from "@/lib/navigation";

export function BuyAgain({ currentOrderId }: { currentOrderId?: string }) {
  const { user, orders, catalog, stores, addToCart } = usePartX();
  if (!user) return null;
  const seen = new Set<string>();
  const previous = [...orders.filter((order) => order.id === currentOrderId), ...orders.filter((order) => order.id !== currentOrderId)];
  const items = previous.filter((order) => order.stage === "Delivered" && order.paymentMethod !== "razorpay" && order.orderStatus !== "PAYMENT_CANCELLED")
    .flatMap((order) => (order.items ?? []).flatMap((line) => {
      // Reorders use the current seller listing, price and stock, never old order prices.
      const store = stores.find((candidate) => candidate.id === (line.storeId ?? order.storeId));
      const listing = store?.listings.find((candidate) => candidate.productId === line.product.id)
        ?? store?.listings.find((candidate) => candidate.partNumber === line.product.partNumber);
      const product = listing ? catalog.find((candidate) => candidate.id === listing.productId) : undefined;
      if (!product || !store || !listing || seen.has(product.id)) return [];
      seen.add(product.id);
      return [{ product, store, listing, orderedAt: order.placedAt }];
    })).slice(0, 4);
  if (!items.length) return null;
  return <section className="px-buy-again" aria-labelledby="buy-again-title"><div><h2 id="buy-again-title">Want to buy again?</h2><p>From your delivered orders · Current prices and availability</p></div><div className="px-buy-again-grid">{items.map(({ product, store, listing, orderedAt }) => <article key={product.id}><Link href={productHref(product.id)}><Image src={product.imageUrl ?? `/parts/${product.imageIndex}-v2.png`} alt={product.name} width={76} height={64}/></Link><div><Link href={productHref(product.id)}><h3>{product.name}</h3></Link><small>{store.name}</small><span>Ordered {orderedAt}</span><b>₹{listing.price.toLocaleString("en-IN")}</b></div><button type="button" className="px-btn px-btn-dark" disabled={listing.stock <= 0 || product.stock <= 0} onClick={() => addToCart(product, 1, { storeId: store.id, storeName: store.name, price: listing.price })}>{listing.stock <= 0 || product.stock <= 0 ? "Out of stock" : "Buy again"}</button></article>)}</div></section>;
}
