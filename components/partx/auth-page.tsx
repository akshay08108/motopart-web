"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/types";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";

type AuthMode = "signin" | "register";

const roleCopy = {
  customer: { label: "CUSTOMER ACCESS", story: <>Your garage.<br/>Your parts.<br/><em>One account.</em></>, storyDescription: "Save vehicles, compare verified stores and track every order.", heading: "Customer account", signInDescription: "Sign in to see your garage, orders and saved details.", registerDescription: "Start comparing sellers and tracking your parts in one place." },
  seller: { label: "SELLER ACCESS", story: <>Your store.<br/>Your orders.<br/><em>One command center.</em></>, storyDescription: "Manage products, prices, packing and customer support.", heading: "Seller account", signInDescription: "Sign in to open your store dashboard and packing queue.", registerDescription: "Create your seller profile and submit your store for approval." },
} as const;

export function RoleChoicePage() {
  return <main className="px-auth px-role-gateway">
    <AuthStory role="customer"/>
    <section className="px-auth-panel px-role-panel">
      <Link href="/" className="px-auth-mobile-brand" aria-label="PartX home"><Image src="/brand/partx-light.png" alt="" width={48} height={48} priority/><span>Part<b>X</b></span></Link>
      <div className="px-role-wrap">
        <div className="px-role-heading"><span>PARTX ACCOUNT</span><h1>How are you<br/>using PartX?</h1><p>Choose your account type to continue.</p></div>
        <div className="px-role-choices">
          <RoleChoice role="customer" title="Customer" description="Buy parts, compare stores and track orders"/>
          <RoleChoice role="seller" title="Seller" description="Manage products, prices, packing and support"/>
        </div>
        <Link className="px-role-home" href="/"><Icon name="back"/>Back to PartX home</Link>
      </div>
    </section>
  </main>;
}

function RoleChoice({ role, title, description }: { role: UserRole; title: string; description: string }) {
  return <Link className={`px-role-choice px-role-${role}`} href={`/login/${role}`}><span className="px-role-icon"><Icon name={role === "customer" ? "user" : "store"}/></span><h2>{title}</h2><p>{description}</p><span className="px-role-cta">Continue as {role}<Icon name="arrow"/></span></Link>;
}

export function RoleAuthPage({ role }: { role: UserRole }) {
  const router = useRouter();
  const { signIn, register, resetPassword, user, authHydrated } = usePartX();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const copy = roleCopy[role];

  useEffect(() => {
    if (!authHydrated || !user || !user.roles.includes(role)) return;
    router.replace(role === "seller" ? user.sellerStatus === "pending" ? "/seller/pending" : "/seller" : "/account");
  }, [authHydrated, role, router, user]);

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    const data = new FormData(event.currentTarget);
    let success = false;
    if (mode === "register") {
      success = await register({ name: String(data.get("name")), email: String(data.get("email")), mobile: String(data.get("mobile")), password: String(data.get("password")), role, storeName: String(data.get("storeName") ?? "") });
    } else success = await signIn(identifier, String(data.get("password")), role);
    setBusy(false);
    if (success) router.replace(role === "seller" ? mode === "register" ? "/seller/pending" : "/seller" : "/account");
    else setError(`We could not sign you in as a ${role}. Check your email, password and selected account type.`);
  };

  const changeMode = (next: AuthMode) => { setMode(next); setError(""); setNotice(""); };

  const requestReset = async () => {
    setError(""); setNotice("");
    if (!identifier.includes("@")) { setError("Enter your email address before requesting a password reset."); return; }
    setBusy(true);
    const sent = await resetPassword(identifier);
    setBusy(false);
    if (sent) setNotice("Password reset email sent. Check your inbox and spam folder.");
    else setError("We could not send a reset email. Check the address and try again.");
  };

  return <main className={`px-auth px-auth-${role}`}>
    <AuthStory role={role}/>
    <section className="px-auth-panel">
      <Link href="/" className="px-auth-mobile-brand" aria-label="PartX home"><Image src="/brand/partx-light.png" alt="" width={48} height={48} priority/><span>Part<b>X</b></span></Link>
      <div className="px-auth-form-wrap">
        <Link className="px-auth-role-back" href="/login"><Icon name="back"/>Choose another account type</Link>
        <div className="px-auth-heading"><span>PARTX {copy.heading.toUpperCase()}</span><h2>{mode === "signin" ? "Welcome back" : role === "seller" ? "Register your store" : "Create your account"}</h2><p>{mode === "signin" ? copy.signInDescription : copy.registerDescription}</p></div>
        <div className="px-auth-tabs" role="tablist"><button type="button" className={mode === "signin" ? "active" : ""} onClick={() => changeMode("signin")}>Sign in</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>{role === "seller" ? "Register store" : "Create account"}</button></div>
        <form className="px-auth-form" onSubmit={complete}>
          {mode === "register" ? <label>Full name<div><Icon name="user"/><input name="name" autoComplete="name" placeholder="Your full name" required/></div></label> : null}
          {mode === "register" && role === "seller" ? <label>Store name<div><Icon name="store"/><input name="storeName" placeholder="Your business name" required/></div></label> : null}
          {mode === "signin" ? <label>{role === "seller" ? "Seller email" : "Email address"}<div><Icon name="mail"/><input name="identifier" autoComplete="username" type="email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={role === "seller" ? "seller@store.com" : "you@example.com"} required/></div></label> : null}
          {mode === "register" ? <label>Email address<div><Icon name="mail"/><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></div></label> : null}
          {mode === "register" ? <label>Mobile number<div><Icon name="phone"/><input name="mobile" type="tel" autoComplete="tel" placeholder="+91 98765 43210" required/></div></label> : null}
          <label>Password<div><Icon name="lock"/><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} placeholder="Minimum 6 characters" required/><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name="eye"/></button></div></label>
          {mode === "signin" ? <div className="px-auth-options"><label><input type="checkbox" defaultChecked/>Remember me</label><button type="button" onClick={requestReset} disabled={busy}>Forgot password?</button></div> : null}
          {error ? <p className="px-auth-error" role="alert">{error}</p> : null}
          {notice ? <p className="px-auth-notice" role="status">{notice}</p> : null}
          <button className="px-btn px-btn-red px-auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? `Sign in as ${role}` : role === "seller" ? "Submit seller application" : "Create customer account"}<Icon name="arrow"/></button>
        </form>
        <p className="px-auth-demo"><b>FIREBASE SECURED</b> {role === "seller" ? "New seller accounts are saved with pending status until the store is approved." : "Your customer account and role are now stored securely in Firebase."}</p>
      </div>
    </section>
  </main>;
}

function AuthStory({ role }: { role: UserRole }) {
  const copy = roleCopy[role];
  return <section className="px-auth-story"><Link href="/" className="px-auth-brand" aria-label="PartX home"><Image src="/brand/partx-dark.png" alt="" width={58} height={58} priority/><span>Part<b>X</b></span></Link><div className="px-auth-message"><span>{copy.label}</span><h1>{copy.story}</h1><p>{copy.storyDescription}</p></div><Image className="px-auth-part" src="/parts/0-v2.png" alt="Bosch brake parts" width={720} height={520} priority/><div className="px-auth-proof"><div><Icon name="check"/><span><b>Verified fitment</b>Shop confidently</span></div><div><Icon name="store"/><span><b>Compare sellers</b>You choose the price</span></div><div><Icon name="orders"/><span><b>Live tracking</b>Every order update</span></div></div></section>;
}

export function SellerPendingPage() {
  const router = useRouter(); const { user, signOut } = usePartX();
  return <main className="px-seller-pending"><Link href="/" className="px-auth-mobile-brand"><Image src="/brand/partx-light.png" alt="" width={54} height={54} priority/><span>Part<b>X</b></span></Link><div><span className="px-pending-icon"><Icon name="store"/></span><h1>Store review in progress</h1><p>Thanks, {user?.name}. <b>{user?.storeName ?? "Your store"}</b> has been submitted for approval. We’ll unlock products, orders and packing after verification.</p><dl><div><dt>Application status</dt><dd>Pending approval</dd></div><div><dt>Seller email</dt><dd>{user?.email}</dd></div><div><dt>What happens next</dt><dd>Business and store details are reviewed</dd></div></dl><button className="px-btn px-btn-dark" onClick={() => { signOut(); router.replace("/login/seller"); }}><Icon name="logout"/>Sign out</button></div></main>;
}
