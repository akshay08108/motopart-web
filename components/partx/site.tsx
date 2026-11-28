"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";
import { PartXProvider } from "./app-provider";
import { SellerProvider } from "./seller-provider";
import { CapacitorBridge } from "./capacitor-bridge";
import { OpeningAnimation } from "./opening-animation";

export function PartXSite({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return children;
  return <OpeningAnimation><PartXProvider><SellerProvider><CapacitorBridge/><AppShell>{children}</AppShell></SellerProvider></PartXProvider></OpeningAnimation>;
}
