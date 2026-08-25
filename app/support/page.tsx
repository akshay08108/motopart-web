import { Suspense } from "react";
import { SupportPage } from "@/components/partx/account-pages";
export default function Page() { return <Suspense fallback={<div className="px-page px-container">Loading support…</div>}><SupportPage /></Suspense>; }
