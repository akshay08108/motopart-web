import { Suspense } from "react";
import { SellerOrderRoute } from "@/components/partx/static-detail-routes";

export default function Page() {
  return <Suspense fallback={<div className="sx-main px-route-loading">Loading seller order…</div>}><SellerOrderRoute/></Suspense>;
}
