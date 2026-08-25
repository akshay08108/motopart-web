"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { useSeller } from "./seller-provider";

const sellerNav = [
  ["/seller", "grid", "Dashboard"], ["/seller/orders", "orders", "Orders"], ["/seller/packing", "box", "Packing Queue"], ["/seller/tickets", "ticket", "Tickets"], ["/seller/products", "package", "Products & Prices"], ["/seller/reviews", "star", "Reviews"], ["/seller/settings", "settings", "Store Settings"],
] as const;

export function SellerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tickets, sellerOrders, alertsEnabled, activeAlert, enableAlerts, dismissAlert } = useSeller();
  const [menuOpen, setMenuOpen] = useState(false);
  const openTickets = tickets.filter((ticket) => ticket.status === "Open").length;
  const newOrders = sellerOrders.filter((order) => order.status === "New").length;
  const toPack = sellerOrders.filter((order) => ["New", "Accepted", "Packing"].includes(order.status)).length;
  const active = (href: string) => href === "/seller" ? pathname === href : pathname.startsWith(href);
  const countFor = (href: string) => href.endsWith("orders") ? newOrders : href.endsWith("packing") ? toPack : href.endsWith("tickets") ? openTickets : 0;

  useEffect(() => {
    if (!activeAlert) return;
    const timer = window.setTimeout(dismissAlert, 6000);
    return () => window.clearTimeout(timer);
  }, [activeAlert, dismissAlert]);

  return <div className="sx-app">
    <aside className={menuOpen ? "sx-sidebar is-open" : "sx-sidebar"}>
      <Link href="/seller" className="sx-logo"><Image src="/brand/partx-dark.png" width={46} height={46} alt=""/><b>PART<span>X</span></b></Link>
      <nav aria-label="Seller navigation">{sellerNav.map(([href, icon, label]) => <Link className={active(href) ? "active" : ""} href={href} key={href} onClick={() => setMenuOpen(false)}><Icon name={icon}/><span>{label}</span>{countFor(href) > 0 ? <em>{countFor(href)}</em> : null}</Link>)}</nav>
      <Link className="sx-customer-switch" href="/account"><Icon name="user"/>Switch to Customer<Icon name="logout"/></Link>
    </aside>
    <div className="sx-workspace">
      <header className="sx-topbar">
        <button className="sx-mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle seller menu"><Icon name={menuOpen ? "close" : "menu"}/></button>
        <div className="sx-store-name"><b>AutoHub Mumbai</b><span><i/>Online</span></div>
        <div className="sx-top-actions">
          <button className={alertsEnabled ? "sx-alert-toggle enabled" : "sx-alert-toggle"} onClick={enableAlerts}><Icon name="volume"/>{alertsEnabled ? "Alerts enabled" : "Enable alerts"}</button>
          <Link href="/seller/tickets" className="sx-bell" aria-label={`${openTickets} open tickets`}><Icon name="bell"/>{openTickets > 0 ? <span>{openTickets}</span> : null}</Link>
          <div className="sx-seller-avatar">AM</div>
        </div>
      </header>
      <main className="sx-main">{children}</main>
    </div>
    {activeAlert ? <div className="sx-alert-toast" role="status" aria-live="assertive"><Icon name="bell"/><div><b>{activeAlert.kind === "order" ? "New order received" : "Urgent ticket received"}</b><strong>{activeAlert.kind === "order" ? activeAlert.order.id : activeAlert.ticket.id}</strong><span>{activeAlert.kind === "order" ? `${activeAlert.order.productName} · ${activeAlert.order.fulfilment}` : `${activeAlert.ticket.issue} · ${activeAlert.ticket.orderId}`}</span></div><button onClick={dismissAlert} aria-label="Dismiss alert"><Icon name="close"/></button></div> : null}
    <nav className="sx-mobile-nav" aria-label="Seller mobile navigation">{sellerNav.slice(0, 5).map(([href, icon, label]) => <Link className={active(href) ? "active" : ""} href={href} key={href}><Icon name={icon}/><span>{label === "Packing Queue" ? "Packing" : label.replace("Products & Prices", "Products")}</span>{countFor(href) > 0 ? <em>{countFor(href)}</em> : null}</Link>)}</nav>
  </div>;
}
