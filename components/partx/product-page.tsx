"use client";

import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";

export function ProductPage({ product }: { product: Product }) {
  const { addToCart, activeVehicleId, vehicles, stores } = usePartX();
  const vehicle = vehicles.find((item) => item.id === activeVehicleId);
  const compatible = product.compatibleVehicleIds.includes(activeVehicleId);
  const storeOptions = stores.filter((store) => store.listings.some((listing) => listing.productId === product.id));
  return <div className="px-page px-container">
    <Link className="px-back-link" href="/shop"><Icon name="back"/>Back to parts</Link>
    <div className="px-detail-grid">
      <div className="px-detail-image"><Image src={`/parts/${product.imageIndex}-v2.png`} alt={product.name} width={900} height={720} priority/><span>{product.kind}</span></div>
      <div className="px-detail-copy">
        <div className="px-eyebrow">{product.brand} · {product.category}</div>
        <h1>{product.name}</h1>
        <div className="px-rating">★ {product.rating} <span>{product.reviews.toLocaleString("en-IN")} reviews</span></div>
        <div className="px-detail-price"><strong>₹{product.price.toLocaleString("en-IN")}</strong><s>₹{product.listPrice.toLocaleString("en-IN")}</s><span>Inclusive of taxes</span></div>
        <div className={compatible ? "px-fitment-box fits" : "px-fitment-box"}><Icon name={compatible ? "check" : "garage"}/><div><b>{compatible ? `Fits your ${vehicle?.make} ${vehicle?.model}` : "Fitment not confirmed"}</b><span>{compatible ? `${vehicle?.year} · ${vehicle?.variant}` : "Select a compatible vehicle in My Garage"}</span></div></div>
        <dl className="px-specs"><div><dt>Part number</dt><dd>{product.partNumber}</dd></div><div><dt>OEM reference</dt><dd>{product.oemNumber}</dd></div><div><dt>Warranty</dt><dd>{product.warranty}</dd></div><div><dt>Stock</dt><dd>{product.stock} available</dd></div></dl>
        <button className="px-btn px-btn-red px-btn-large" onClick={() => addToCart(product)}>Add to cart · ₹{product.price.toLocaleString("en-IN")} <Icon name="cart"/></button>
        <p className="px-delivery-callout"><Icon name="orders"/><b>{product.deliveryLabel}</b> · Pickup also available at checkout</p>
      </div>
    </div>
    <section className="px-subsection"><div className="px-section-head"><div><span>COMPARE SELLERS</span><h2>Available stores</h2></div></div>
      <div className="px-seller-list">{(storeOptions.length ? storeOptions : stores.slice(0, 2)).map((store, index) => { const listing = store.listings.find((item) => item.productId === product.id); return <div key={store.id}><div><b>{store.name}</b><span>★ {store.rating} · {store.ratingCount ?? 0} verified ratings · {store.distanceKm} km</span></div><strong>₹{(listing?.price ?? product.price + index * 50).toLocaleString("en-IN")}</strong><span>{listing?.stock ?? product.stock} in stock</span></div>; })}</div>
    </section>
  </div>;
}
