import "@fontsource-variable/manrope";
import "@fontsource-variable/roboto-condensed";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MotoPart — Exact parts. Delivered fast.",
  description: "Vehicle-compatible auto parts with fast delivery and live tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
