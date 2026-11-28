"use client";

import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { useEffect } from "react";
import type { User } from "firebase/auth";
import type { UserRole } from "./types";
import { firebaseAuth } from "./firebase";
import { PartXAdminError, requestPartXAdmin } from "./partx-admin-api";

const activityEnabled = process.env.NODE_ENV === "production" || Boolean(process.env.NEXT_PUBLIC_PARTX_DELIVERY_API_URL);

export function recordPartXSignIn(user: User) {
  if (!activityEnabled) return;
  void requestPartXAdmin(user, "recordPartXSignIn").catch((error) => {
    if (error instanceof PartXAdminError && error.status < 500) return;
    window.setTimeout(() => {
      if (firebaseAuth.currentUser?.uid === user.uid) void requestPartXAdmin(user, "recordPartXSignIn").catch(() => undefined);
    }, 1_500);
  });
}

export function usePartXPresence(uid?: string, role?: UserRole) {
  useEffect(() => {
    if (!activityEnabled || !uid || (role !== "customer" && role !== "seller")) return;
    const controller = new AbortController();
    const native = Capacitor.isNativePlatform();
    let foreground = !native;
    let nativeListener: PluginListenerHandle | undefined;
    let lastSent = -Infinity;
    function checkIn() {
      const user = firebaseAuth.currentUser;
      if (controller.signal.aborted || !foreground || !user || user.uid !== uid || document.visibilityState !== "visible" || Date.now() - lastSent < 55_000) return;
      lastSent = Date.now();
      void requestPartXAdmin(user, "checkInPartXPresence", {}, controller.signal).catch(() => undefined);
    }
    if (native) {
      void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        foreground = isActive;
        checkIn();
      }).then((listener) => {
        if (controller.signal.aborted) void listener.remove();
        else nativeListener = listener;
      }).catch(() => undefined);
      void CapacitorApp.getState().then(({ isActive }) => {
        foreground = isActive;
        checkIn();
      }).catch(() => undefined);
    } else checkIn();
    const timer = window.setInterval(checkIn, 60_000);
    document.addEventListener("visibilitychange", checkIn);
    window.addEventListener("online", checkIn);
    return () => {
      controller.abort();
      void nativeListener?.remove();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkIn);
      window.removeEventListener("online", checkIn);
    };
  }, [uid, role]);
}
