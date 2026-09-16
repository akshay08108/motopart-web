import { Suspense } from "react";
import { OrderRoute } from "@/components/partx/static-detail-routes";

export default function Page() {
  return <Suspense fallback={<div className="px-page px-container px-route-loading">Loading order…</div>}><OrderRoute/></Suspense>;
}
