"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roleHome } from "@/lib/app-role";
import type { UserRole } from "@/lib/types";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";

type AuthMode = "signin" | "register";

const roleCopy = {
  customer: { label: "CUSTOMER ACCESS", story: <>Your garage.<br/>Your parts.<br/><em>One account.</em></>, storyDescription: "Save vehicles, compare verified stores and track every order.", heading: "Customer account", signInDescription: "Sign in to see your garage, orders and saved details.", registerDescription: "Start comparing sellers and tracking your parts in one place." },
  seller: { label: "SELLER ACCESS", story: <>Your store.<br/>Your orders.<br/><em>One command center.</em></>, storyDescription: "Manage products, prices, packing and customer support.", heading: "Seller account", signInDescription: "Sign in to open your store dashboard and packing queue.", registerDescription: "Create your store, add products and receive orders immediately." },
  rider: { label: "PARTX RIDER", story: <>Pick up.<br/>Deliver.<br/><em>Keep moving.</em></>, storyDescription: "Your assigned deliveries, pickup details and customer destinations in one place.", heading: "Rider portal", signInDescription: "Sign in to view your pickups and deliveries.", registerDescription: "Create a rider account and verify your email to access the app." },
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
      </div>
    </section>
  </main>;
}

function RoleChoice({ role, title, description }: { role: UserRole; title: string; description: string }) {
  return <Link className={`px-role-choice px-role-${role}`} href={`/login/${role}`}><span className="px-role-icon"><Icon name={role === "customer" ? "user" : "store"}/></span><h2>{title}</h2><p>{description}</p><span className="px-role-cta">Continue as {role}<Icon name="arrow"/></span></Link>;
}

export function RoleAuthPage({ role, signupFirst = false }: { role: UserRole; signupFirst?: boolean }) {
  const router = useRouter();
  const { signIn, register, resetPassword, user, authHydrated, customerDevice, emailVerified, requestEmailVerification, refreshEmailVerification, signOut } = usePartX();
  const [mode, setMode] = useState<AuthMode>(signupFirst ? "register" : "signin");
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const copy = roleCopy[role];
  const mustVerifyEmail = role === "customer" || (role === "rider" && user?.riderSelfRegistered);
  const awaitingVerification = user?.activeRole === role && mustVerifyEmail && !emailVerified;

  useEffect(() => {
    if (!authHydrated || !user || user.activeRole !== role || awaitingVerification) return;
    router.replace(roleHome[role]);
  }, [authHydrated, awaitingVerification, role, router, user]);

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    const data = new FormData(event.currentTarget);
    let success = false;
    if (mode === "register") {
      success = await register({ name: String(data.get("name")), email: String(data.get("email")), mobile: String(data.get("mobile")), password: String(data.get("password")), role, storeName: String(data.get("storeName") ?? "") });
    } else success = await signIn(identifier, String(data.get("password")), role);
    setBusy(false);
    if (!success) setError(mode === "register"
      ? "We could not create this account. Check your details. If you already registered, sign in or reset your password."
      : `We could not sign you in as a ${role}. Check your email, password and selected account type.`);
  };

  const changeMode = (next: AuthMode) => { setMode(next); setShowPassword(false); setError(""); setNotice(""); };

  const requestReset = async () => {
    setError(""); setNotice("");
    if (!identifier.includes("@")) { setError("Enter your email address before requesting a password reset."); return; }
    setBusy(true);
    const sent = await resetPassword(identifier);
    setBusy(false);
    if (sent) setNotice("Password reset email sent. Check your inbox and spam folder.");
    else setError("We could not send a reset email. Check the address and try again.");
  };

  if (awaitingVerification && user) {
    const confirmEmail = async (resend: boolean) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        if (resend) {
          await requestEmailVerification();
          setNotice("Verification email sent.");
        } else if (!await refreshEmailVerification()) {
          setError("Open the verification link in your inbox, then try again.");
        }
      } catch {
        setError("Could not verify your email right now. Try again shortly.");
      } finally {
        setBusy(false);
      }
    };
    return <main className={`px-auth px-auth-${role}`}>
      <AuthStory role={role} dedicated={signupFirst}/>
      <section className="px-auth-panel">
        <AuthBrand dedicated={signupFirst} mobile/>
        <div className="px-auth-form-wrap">
          <div className="px-auth-heading"><h1>Verify your email</h1><p>Open the verification link for {user.email}. Request a new link if you need one.</p></div>
          <div className="px-auth-form">
            <button className="px-btn px-btn-red" disabled={busy} onClick={() => void confirmEmail(false)}>I’ve verified my email</button>
            <button className="px-btn px-btn-outline" disabled={busy} onClick={() => void confirmEmail(true)}>Send verification email</button>
            <button className="px-link-button" disabled={busy} onClick={() => void signOut()}>Sign out</button>
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
          </div>
        </div>
      </section>
    </main>;
  }

  return <main className={`px-auth px-auth-${role}`}>
    <AuthStory role={role} dedicated={signupFirst}/>
    <section className="px-auth-panel">
      <AuthBrand dedicated={signupFirst} mobile/>
      <div className="px-auth-form-wrap">
        {!signupFirst && !customerDevice && role !== "rider" ? (
          <Link className="px-auth-role-back" href="/login"><Icon name="back"/>Choose another account type</Link>
        ) : null}
        <div className="px-auth-heading"><span>PARTX {copy.heading.toUpperCase()}</span><h2>{mode === "signin" ? "Welcome back" : role === "seller" ? "Create your seller account" : role === "rider" ? "Create your rider account" : "Create your customer account"}</h2><p>{mode === "signin" ? copy.signInDescription : copy.registerDescription}</p></div>
        <form className="px-auth-form" key={mode} onSubmit={complete}>
          {mode === "register" ? <label>Full name<div><Icon name="user"/><input name="name" autoComplete="name" placeholder="Your full name" maxLength={role === "rider" ? 120 : undefined} required/></div></label> : null}
          {mode === "register" && role === "seller" ? <label>Store name<div><Icon name="store"/><input name="storeName" placeholder="Your business name" required/></div></label> : null}
          {mode === "signin" ? <label>{role === "seller" ? "Seller email" : "Email address"}<div><Icon name="mail"/><input name="identifier" autoComplete="username" type="email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={role === "seller" ? "seller@store.com" : "you@example.com"} required/></div></label> : null}
          {mode === "register" ? <label>Email address<div><Icon name="mail"/><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></div></label> : null}
          {mode === "register" ? <label>Mobile number<div><Icon name="phone"/><input name="mobile" type="tel" autoComplete="tel" placeholder="+91 98765 43210" required/></div></label> : null}
          <label>Password<div><Icon name="lock"/><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} placeholder="Minimum 6 characters" required/><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name="eye"/></button></div></label>
          {mode === "signin" ? <div className="px-auth-options"><label><input type="checkbox" defaultChecked/>Remember me</label><button type="button" onClick={requestReset} disabled={busy}>Forgot password?</button></div> : null}
          {error ? <p className="px-auth-error" role="alert">{error}</p> : null}
          {notice ? <p className="px-auth-notice" role="status">{notice}</p> : null}
          <button className="px-btn px-btn-red px-auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? `Sign in as ${role}` : `Create ${role} account`}<Icon name="arrow"/></button>
        </form>
        <p className="px-auth-options px-auth-mode-switch">
          {mode === "register" ? "Already have an account?" : "New to PartX?"}
          <button type="button" disabled={busy} onClick={() => changeMode(mode === "register" ? "signin" : "register")}>
            {mode === "register" ? "Sign in" : "Create account"}
          </button>
        </p>
      </div>
    </section>
  </main>;
}

function AuthStory({ role, dedicated = false }: { role: UserRole; dedicated?: boolean }) {
  const copy = roleCopy[role];
  return <section className="px-auth-story"><AuthBrand dedicated={dedicated}/><div className="px-auth-message"><span>{copy.label}</span><h1>{copy.story}</h1><p>{copy.storyDescription}</p></div><Image className="px-auth-part" src="/parts/0-v2.png" alt="Bosch brake parts" width={720} height={520} priority/><div className="px-auth-proof"><div><Icon name="check"/><span><b>Verified fitment</b>Shop confidently</span></div><div><Icon name="store"/><span><b>Compare sellers</b>You choose the price</span></div><div><Icon name="orders"/><span><b>Live tracking</b>Every order update</span></div></div></section>;
}

function AuthBrand({ dedicated, mobile = false }: { dedicated: boolean; mobile?: boolean }) {
  const className = mobile ? "px-auth-mobile-brand" : "px-auth-brand";
  const size = mobile ? 48 : 58;
  const brand = <><Image src={mobile ? "/brand/partx-light.png" : "/brand/partx-dark.png"} alt="" width={size} height={size} priority/><span>Part<b>X</b></span></>;
  return dedicated ? <div className={className}>{brand}</div> : <Link href="/" className={className} aria-label="PartX home">{brand}</Link>;
}
