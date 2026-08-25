import { Suspense } from "react";
import { ShopPage } from "@/components/partx/shop-page";

export default function Page() { return <Suspense fallback={<div className="px-page px-container">Loading parts…</div>}><ShopPage /></Suspense>; }
