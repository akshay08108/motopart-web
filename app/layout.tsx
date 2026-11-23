import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/plus-jakarta-sans/wght-italic.css";
import "@fontsource-variable/sora";
import "@fontsource/exo-2/800-italic.css";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "./partx.css";
import "./delivery-location.css";
import "./cart.css";
import "./order-experience.css";
import "./search.css";
import "./rider.css";
import "./rider-earnings.css";
import "./seller-payments.css";
import "./typography.css";
import "./icon-system.css";
import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/partx/app-shell";
import { PartXProvider } from "@/components/partx/app-provider";
import { SellerProvider } from "@/components/partx/seller-provider";
import { CapacitorBridge } from "@/components/partx/capacitor-bridge";
import { OpeningAnimation } from "@/components/partx/opening-animation";

export const metadata: Metadata = {
  title: { default: "PartX · The right part. The first time.", template: "%s · PartX" },
  description: "Vehicle-verified auto parts from trusted stores, ready for pickup or delivery.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d11" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body><OpeningAnimation><PartXProvider><SellerProvider><CapacitorBridge/><AppShell>{children}</AppShell></SellerProvider></PartXProvider></OpeningAnimation></body>
    </html>
  );
}
