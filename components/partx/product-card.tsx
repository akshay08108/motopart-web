"use client";

import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, activeVehicleId } = usePartX();
  const compatible = product.compatibleVehicleIds.includes(activeVehicleId);
  const discount = Math.round((1 - product.price / product.listPrice) * 100);
  return <article className="px-product-card">
    <Link href={`/shop/${product.id}`} className="px-product-image">
      {discount > 0 && <span className="px-discount">-{discount}%</span>}
      <Image src={`/parts/${product.imageIndex}-v2.png`} alt={product.name} width={520} height={390} />
    </Link>
    <div className="px-product-body">
      <div className="px-product-meta"><b>{product.brand}</b><span>★ {product.rating}</span></div>
      <Link href={`/shop/${product.id}`}><h3>{product.name}</h3></Link>
      <p className={compatible ? "px-fitment fits" : "px-fitment"}><Icon name={compatible ? "check" : "garage"}/>{compatible ? "Fits your selected vehicle" : "Check vehicle fitment"}</p>
      <div className="px-product-price"><strong>₹{product.price.toLocaleString("en-IN")}</strong><s>₹{product.listPrice.toLocaleString("en-IN")}</s></div>
      <div className="px-product-delivery">{product.deliveryLabel}</div>
      <button className="px-btn px-btn-dark" onClick={() => addToCart(product)}>Add to cart <Icon name="cart"/></button>
    </div>
  </article>;
}
