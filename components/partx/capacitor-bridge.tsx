"use client";

import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function dismissTopLayer() {
  const alertClose = document.querySelector<HTMLButtonElement>('[aria-label="Dismiss alert"]');
  if (alertClose) {
    alertClose.click();
    return true;
  }

  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  const dialogClose = dialog?.querySelector<HTMLButtonElement>('button[aria-label^="Close"], button[aria-label="Rate later"]');
  if (dialogClose) {
    dialogClose.click();
    return true;
  }

  const customerMenu = document.querySelector<HTMLElement>(".px-nav.is-open");
  if (customerMenu) {
    document.querySelector<HTMLButtonElement>(".px-menu-button")?.click();
    return true;
  }

  const sellerMenu = document.querySelector<HTMLElement>(".sx-sidebar.is-open");
  if (sellerMenu) {
    document.querySelector<HTMLButtonElement>(".sx-mobile-menu")?.click();
    return true;
  }

  return false;
}

export function CapacitorBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.dataset.native = "true";

    let disposed = false;
    const listeners: Array<{ remove: () => Promise<void> }> = [];

    const syncStatusBar = async () => {
      const dark = document.documentElement.dataset.theme === "dark";
      await Promise.allSettled([
        StatusBar.setOverlaysWebView({ overlay: false }),
        StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }),
        StatusBar.setBackgroundColor({ color: dark ? "#0b0d11" : "#ffffff" }),
      ]);
    };

    void syncStatusBar();
    void Network.getStatus().then((status) => {
      if (!disposed) setOnline(status.connected);
    });
    void Network.addListener("networkStatusChange", (status) => setOnline(status.connected)).then((listener) => {
      if (disposed) void listener.remove();
      else listeners.push(listener);
    });
    void CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (dismissTopLayer()) return;
      if (pathnameRef.current === "/") {
        void CapacitorApp.minimizeApp();
      } else if (canGoBack) {
        router.back();
      } else {
        router.replace("/");
      }
    }).then((listener) => {
      if (disposed) void listener.remove();
      else listeners.push(listener);
    });

    const themeObserver = new MutationObserver(() => void syncStatusBar());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const openExternalLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !/^https?:/i.test(anchor.href)) return;
      const target = new URL(anchor.href);
      if (target.origin === window.location.origin) return;
      event.preventDefault();
      void Browser.open({ url: target.toString() });
    };
    document.addEventListener("click", openExternalLink, true);

    const finishStartup = window.setTimeout(() => void SplashScreen.hide(), 150);
    return () => {
      disposed = true;
      window.clearTimeout(finishStartup);
      themeObserver.disconnect();
      document.removeEventListener("click", openExternalLink, true);
      for (const listener of listeners) void listener.remove();
    };
  }, [router]);

  if (online) return null;
  return <div className="px-offline-banner" role="status" aria-live="polite">You’re offline. Saved screens remain available; live orders, products, and payments will refresh when the connection returns.</div>;
}
