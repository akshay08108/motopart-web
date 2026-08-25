import "@fontsource-variable/manrope";
import "@fontsource-variable/roboto-condensed";
import "./globals.css";
import "./partx.css";
import type { Metadata } from "next";
import { AppShell } from "@/components/partx/app-shell";
import { PartXProvider } from "@/components/partx/app-provider";
import { SellerProvider } from "@/components/partx/seller-provider";

export const metadata: Metadata = {
  title: { default: "PartX — The right part. The first time.", template: "%s · PartX" },
  description: "Vehicle-verified auto parts from trusted stores, ready for pickup or delivery.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body><PartXProvider><SellerProvider><AppShell>{children}</AppShell></SellerProvider></PartXProvider></body>
    </html>
  );
}
