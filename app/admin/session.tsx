"use client";

import { browserSessionPersistence, getAuth, initializeAuth, onIdTokenChanged, signOut, type User } from "firebase/auth";
import { getApp, getApps, initializeApp } from "firebase/app";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { firebaseApp } from "@/lib/firebase";
import { PartXAdminError, requestPartXAdmin } from "@/lib/partx-admin-api";

const name = "partx-private-admin";
const existing = getApps().some((app) => app.name === name);
const adminApp = existing ? getApp(name) : initializeApp(firebaseApp.options, name);
export const adminAuth = existing ? getAuth(adminApp) : initializeAuth(adminApp, { persistence: browserSessionPersistence });

type Session = { user: User | null; state: "loading" | "signed-out" | "verify-email" | "denied" | "unavailable" | "owner"; retry: () => void };
const AdminContext = createContext<Session | null>(null);

export function AdminSession({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<{ user: User | null; state: Session["state"] }>({ user: null, state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let controller: AbortController | undefined;
    let allowedUser: User | null = null;
    const unsubscribe = onIdTokenChanged(adminAuth, async (user) => {
      controller?.abort();
      if (!user) {
        allowedUser = null;
        setResult({ user, state: "signed-out" });
        return;
      }
      const check = new AbortController();
      controller = check;
      if (allowedUser?.uid !== user.uid) setResult({ user, state: "loading" });
      try {
        await requestPartXAdmin(user, "partxAdmin", { view: "session" }, check.signal);
        if (check.signal.aborted) return;
        allowedUser = user;
        setResult({ user, state: "owner" });
      } catch (error) {
        if (check.signal.aborted) return;
        allowedUser = null;
        const rejected = error instanceof PartXAdminError && [401, 403].includes(error.status);
        const state = rejected ? (error.code === "admin-unverified-email" ? "verify-email" : "denied") : "unavailable";
        setResult({ user, state });
      }
    }, () => setResult({ user: null, state: "unavailable" }));
    return () => { controller?.abort(); unsubscribe(); };
  }, [attempt]);

  return <AdminContext.Provider value={{ ...result, retry: () => setAttempt((value) => value + 1) }}>{children}</AdminContext.Provider>;
}

export function useAdminSession() {
  const session = useContext(AdminContext);
  if (!session) throw new Error("PartX admin session is unavailable.");
  return session;
}

export const signOutAdmin = () => signOut(adminAuth);
