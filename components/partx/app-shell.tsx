"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import { SellerShell } from "./seller-shell";

const nav = [
  ["/", "Home"], ["/shop", "Shop Parts"], ["/garage", "My Garage"], ["/orders", "Orders"], ["/offers", "Offers"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme, cartCount, user, authHydrated } = usePartX();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/shop${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
  };
  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  const protectedRoute = ["/account", "/orders", "/garage", "/checkout", "/support"].some((route) => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    if (authHydrated && protectedRoute && !user) router.replace("/login");
  }, [authHydrated, protectedRoute, router, user]);

  if (pathname.startsWith("/seller")) return <SellerShell>{children}</SellerShell>;
  if (pathname === "/login") return children;
  if (protectedRoute && (!authHydrated || !user)) return <div className="px-auth-loading"><Image src="/brand/partx-light.png" alt="PartX" width={62} height={62}/><span>Opening your account…</span></div>;

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
        <form className="px-header-search" onSubmit={submit} role="search">
          <Icon name="search" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search part name, number or brand" aria-label="Search parts" />
        </form>
        <div className="px-header-actions">
          <button className="px-icon-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}><Icon name={theme === "light" ? "moon" : "sun"}/></button>
          <Link href={user ? "/account" : "/login"} className="px-icon-button" aria-label={user ? "Account" : "Sign in"}><Icon name="user"/></Link>
          <Link href="/cart" className="px-icon-button px-cart-button" aria-label={`Cart with ${cartCount} items`}><Icon name="cart"/>{cartCount > 0 && <span>{cartCount}</span>}</Link>
          <button className="px-menu-button" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu"><Icon name={open ? "close" : "menu"}/></button>
        </div>
      </div>
    </header>
    <div className="px-ticker" aria-label="Latest parts"><span>LATEST PARTS</span><div><b>MG Hector parts now available</b><i/>BMW air filters back in stock<i/>New Bosch brake range added<i/>Free delivery above ₹999</div></div>
    <main>{children}</main>
    <footer className="px-footer">
      <div className="px-container px-footer-grid">
        <div><div className="px-footer-brand">Part<span>X</span></div><p>The right part. The first time.</p></div>
        <div><b>Shop</b><Link href="/shop">All parts</Link><Link href="/offers">Offers</Link><Link href="/garage">My garage</Link></div>
        <div><b>Help</b><Link href="/support">Contact support</Link><Link href="/orders">Track order</Link><Link href="/account">Account</Link></div>
        <div><b>Partners</b><Link href="/sell">Add your store</Link><p>Sell parts at your prices.</p></div>
      </div>
      <div className="px-container px-footer-bottom">© 2026 PartX · Demo commerce environment · Built for real API integration</div>
    </footer>
    <nav className="px-mobile-nav" aria-label="Mobile navigation">
      {[["/", "home", "Home"], ["/shop", "grid", "Shop"], ["/cart", "cart", "Cart"], ["/orders", "orders", "Orders"], [user ? "/account" : "/login", "user", user ? "Account" : "Sign in"]].map(([href, icon, label]) => <Link key={href} className={active(href) ? "active" : ""} href={href}><span><Icon name={icon}/>{href === "/cart" && cartCount > 0 && <em>{cartCount}</em>}</span>{label}</Link>)}
    </nav>
  </div>;
}
