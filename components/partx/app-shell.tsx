"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import { SellerShell } from "./seller-shell";
import { CartFeedback } from "./cart-feedback";
import { PartSearch } from "./part-search";
import { sameDeliveryArea } from "@/lib/delivery-pricing";
import { RiderShell } from "./rider-portal";

const nav = [
  ["/", "Home"], ["/shop", "Shop Parts"], ["/garage", "My Garage"], ["/orders", "Orders"], ["/offers", "Offers"],
];
const riderApp = process.env.NEXT_PUBLIC_PARTX_PORTAL === "rider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const router = useRouter();
  const { theme, toggleTheme, cartCount, cartNotice, announcements, stores, location, garageReady, needsVehicle, user, authHydrated, customerDevice, emailVerified } = usePartX();
  const [open, setOpen] = useState(false);
  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  const sellerRoute = pathname === "/seller" || pathname === "/seller-order" || pathname.startsWith("/seller/");
  const authRoute = pathname === "/login" || pathname.startsWith("/login/");
  const riderRoute = pathname === "/rider" || pathname.startsWith("/rider/");
  const isCustomer = Boolean(user?.roles.includes("customer"));
  const isSeller = user?.activeRole === "seller";

  let destination: string | undefined;
  if (riderApp && !riderRoute && pathname !== "/login/rider") destination = "/rider";
  else if (authHydrated) {
    if (customerDevice && ["/login", "/login/seller"].includes(pathname)) destination = "/login/customer";
    else if (user?.activeRole === "customer" && !emailVerified && !riderRoute && pathname !== "/login/customer") destination = "/login/customer";
    else if (user?.activeRole === "customer" && pathname === "/sell") destination = "/";
    else if (riderRoute && !user?.roles.includes("rider")) destination = "/login/rider";
    else if (!authRoute && !user) destination = "/login";
    else if (sellerRoute && !isSeller) destination = "/";
    else if (sellerRoute && pathname === "/seller/pending") destination = "/seller";
    else if (user && !authRoute && !sellerRoute && !riderRoute) {
      if (!isCustomer) destination = isSeller ? "/seller" : "/rider";
      else if (needsVehicle && pathname !== "/garage") destination = "/garage";
      else if (pathname === "/" && user.activeRole === "seller") destination = "/seller";
    }
  }
  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  if (destination) return <AuthLoading label="Opening PartX…"/>;
  if (authRoute) return authHydrated || pathname === "/login/rider" ? children : <AuthLoading label="Opening PartX…"/>;
  if (!authHydrated || !user) return <AuthLoading label="Opening PartX…"/>;
  if (riderRoute) return <RiderShell key={user.id}>{children}</RiderShell>;
  if (sellerRoute) return <SellerShell>{children}</SellerShell>;
  if (!garageReady) return <AuthLoading label="Loading your garage…"/>;
  const liveUpdates = announcements.filter((announcement) => {
    const store = stores.find((item) => item.id === announcement.storeId);
    return store && sameDeliveryArea(location, store.location);
  });

  return <div className="px-app">
    <header className="px-header">
      <div className="px-container px-header-inner">
        <Link href="/" className="px-brand" aria-label="PartX home">
          <Image className="px-mark px-mark-light" src="/brand/partx-light.png" alt="" width={46} height={46} priority />
          <Image className="px-mark px-mark-dark" src="/brand/partx-dark.png" alt="" width={46} height={46} priority />
          <span>Part<b>X</b></span>
        </Link>
        <nav className={open ? "px-nav is-open" : "px-nav"} aria-label="Primary navigation">
          {nav.map(([href, label]) => <Link key={href} className={active(href) ? "active" : ""} href={href} onClick={() => setOpen(false)}>{label}</Link>)}
        </nav>
        <PartSearch className="px-nav-search"/>
        <div className="px-header-actions">
          <button className="px-icon-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}><Icon name={theme === "light" ? "moon" : "sun"}/></button>
          <Link href={isCustomer ? "/account" : isSeller ? "/seller" : "/login"} className="px-icon-button" aria-label={user ? "Account" : "Sign in"}><Icon name="user"/></Link>
          <Link href="/cart" className="px-icon-button px-cart-button" aria-label={`Cart with ${cartCount} items`}><Icon name="cart" key={cartNotice?.id ?? 0} className={cartNotice?.added ? "px-cart-bump" : undefined}/>{cartCount > 0 && <span>{cartCount}</span>}</Link>
          <button className="px-menu-button" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu"><Icon name={open ? "close" : "menu"}/></button>
        </div>
      </div>
    </header>
    {liveUpdates.length > 0 && <div className="px-ticker" aria-label="Local store updates"><span>LIVE UPDATES</span><div>{liveUpdates.map((announcement) => <Link className="px-ticker-item" key={announcement.id} href={`/shop?store=${encodeURIComponent(announcement.storeId)}`}>{announcement.text}</Link>)}</div></div>}
    <main>{children}</main>
    <CartFeedback/>
    <footer className="px-footer">
      <div className="px-container px-footer-grid">
        <div><div className="px-footer-brand">Part<span>X</span></div><p>The right part. The first time.</p></div>
        <div><b>Shop</b><Link href="/shop">All parts</Link><Link href="/offers">Offers</Link><Link href="/garage">My garage</Link></div>
        <div><b>Help</b><Link href="/support">Contact support</Link><Link href="/orders">Track order</Link><Link href="/account">Account</Link></div>
      </div>
      <div className="px-container px-footer-bottom">© 2026 PartX · Built with Codex</div>
    </footer>
    <nav className="px-mobile-nav" aria-label="Mobile navigation">
      {[["/", "home", "Home"], ["/shop", "grid", "Shop"], ["/cart", "cart", "Cart"], ["/orders", "orders", "Orders"], [isCustomer ? "/account" : isSeller ? "/seller" : "/login", "user", user ? "Account" : "Sign in"]].map(([href, icon, label]) => <Link key={href} className={active(href) ? "active" : ""} href={href}><span><Icon name={icon} key={href === "/cart" ? cartNotice?.id ?? 0 : icon} className={href === "/cart" && cartNotice?.added ? "px-cart-bump" : undefined}/>{href === "/cart" && cartCount > 0 && <em>{cartCount}</em>}</span>{label}</Link>)}
    </nav>
  </div>;
}

function AuthLoading({ label }: { label: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 6_000);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className="px-auth-loading"><Image src="/brand/partx-light.png" alt="PartX" width={62} height={62} priority/><span>{label}</span>{slow ? <><small>This is taking longer than expected. Check your connection and try again.</small><button type="button" onClick={() => window.location.reload()}>Retry</button></> : null}</div>;
}
