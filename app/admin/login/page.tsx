"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { reload, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { adminAuth, signOutAdmin, useAdminSession } from "../session";
import styles from "../admin.module.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const { state, user, retry } = useAdminSession();
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (state === "owner") router.replace("/admin");
  }, [router, state]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); }
    catch { setError(message); }
    finally { setBusy(false); }
  }

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim();
    if (reset) {
      void run(async () => {
        await sendPasswordResetEmail(adminAuth, email).catch((error) => {
          if (error?.code !== "auth/user-not-found") throw error;
        });
        setNotice("If this address has a PartX account, check your email for a password link.");
      }, "Could not request a password link. Try again.");
      return;
    }
    void run(() => signInWithEmailAndPassword(adminAuth, email, String(data.get("password"))), "Unable to sign in. Check your email and password and try again.");
  }

  return <main className={styles.login}>
    <section className={styles.loginCard}>
      <div className={styles.brand}><Image src="/brand/partx-light.png" alt="" width={42} height={42}/><span>Part<b>X</b></span></div>
      <h1>Owner sign in</h1>
      <p>Use the Firebase account designated for PartX operations.</p>
      {(state === "loading" || state === "owner") && <p role="status">Checking owner access…</p>}
      {state === "signed-out" && <form onSubmit={signIn}>
        <label>Email address<input name="email" type="email" autoComplete="username" required/></label>
        {!reset && <label>Password<input name="password" type="password" autoComplete="current-password" required/></label>}
        <button className={styles.primary} disabled={busy}>{busy ? "Please wait…" : reset ? "Send password link" : "Sign in"}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setReset(!reset); setNotice(""); setError(""); }}>{reset ? "Back to sign in" : "Set or reset password"}</button>
      </form>}
      {state === "verify-email" && user && <>
        <p>Verify your email to continue.</p>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => void run(async () => { await sendEmailVerification(user); setNotice("Verification email sent."); }, "Could not send the verification email.")}>Send verification email</button>
          <button type="button" disabled={busy} onClick={() => void run(async () => { await reload(user); await user.getIdToken(true); retry(); }, "Could not check your verification status.")}>Check verification</button>
        </div>
      </>}
      {state === "denied" && <p role="alert" className={styles.error}>This account does not have PartX owner access.</p>}
      {state === "unavailable" && <div role="alert" className={styles.error}>Owner access could not be checked. <button type="button" onClick={retry}>Try again</button></div>}
      {user && ["verify-email", "unavailable", "denied"].includes(state) && <button className={styles.secondary} type="button" onClick={() => void run(signOutAdmin, "Could not sign out. Try again.")} disabled={busy}>Sign out</button>}
      {notice && <p role="status">{notice}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  </main>;
}
