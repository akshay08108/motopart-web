import { Suspense } from "react";
import { CustomerAuthPage } from "@/components/partx/auth-page";

export default function Page() {
  return <Suspense fallback={null}><CustomerAuthPage/></Suspense>;
}
