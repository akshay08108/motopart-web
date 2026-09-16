"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { OrderDetailPage } from "./account-pages";
import { CatalogProductPage } from "./product-page";
import { SellerOrderDetailPage } from "./seller-pages";

function MissingId({ label, href }: { label: string; href: string }) {
  return <div className="px-page px-container px-empty"><h1>{label} not found</h1><p>The link is incomplete or no longer available.</p><Link className="px-btn px-btn-dark" href={href}>Go back</Link></div>;
}

export function ProductRoute() {
  const id = useSearchParams().get("id");
  return id ? <CatalogProductPage id={id}/> : <MissingId label="Product" href="/shop"/>;
}

export function OrderRoute() {
  const id = useSearchParams().get("id");
  return id ? <OrderDetailPage id={id}/> : <MissingId label="Order" href="/orders"/>;
}

export function SellerOrderRoute() {
  const id = useSearchParams().get("id");
  return id ? <SellerOrderDetailPage id={id}/> : <MissingId label="Seller order" href="/seller/orders"/>;
}
