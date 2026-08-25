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
  const { signIn, register, user, authHydrated } = usePartX();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = roleCopy[role];

  useEffect(() => {
    if (!authHydrated || !user || !user.roles.includes(role)) return;
    router.replace(role === "seller" ? user.sellerStatus === "pending" ? "/seller/pending" : "/seller" : "/account");
  }, [authHydrated, role, router, user]);

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setBusy(true);
    const data = new FormData(event.currentTarget);
    let success = false;
    if (mode === "register") {
      success = await register({ name: String(data.get("name")), email: String(data.get("email")), mobile: String(data.get("mobile")), password: String(data.get("password")), role, storeName: String(data.get("storeName") ?? "") });
    } else if (otpMode && role === "customer") {
      const mobile = String(data.get("mobile")); const otp = String(data.get("otp"));
      if (!otpSent) { setOtpSent(true); setBusy(false); return; }
      success = otp === "123456" && await signIn(mobile, "otp-demo", role);
    } else success = await signIn(String(data.get("identifier")), String(data.get("password")), role);
    setBusy(false);
    if (success) router.replace(role === "seller" ? mode === "register" ? "/seller/pending" : "/seller" : "/account");
    else setError(otpMode ? "Enter demo OTP 123456 to continue." : "Please check the fields and try again.");
  };

  const changeMode = (next: AuthMode) => { setMode(next); setOtpMode(false); setOtpSent(false); setError(""); };

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
          {mode === "signin" && !otpMode ? <label>{role === "seller" ? "Seller email" : "Email or mobile number"}<div><Icon name="mail"/><input name="identifier" autoComplete="username" type={role === "seller" ? "email" : "text"} placeholder={role === "seller" ? "seller@store.com" : "you@example.com"} required/></div></label> : null}
          {mode === "register" ? <label>Email address<div><Icon name="mail"/><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></div></label> : null}
          {mode === "register" || otpMode ? <label>Mobile number<div><Icon name="phone"/><input name="mobile" type="tel" autoComplete="tel" placeholder="+91 98765 43210" required/></div></label> : null}
          {otpMode && otpSent ? <label>6-digit OTP<div><Icon name="lock"/><input name="otp" inputMode="numeric" maxLength={6} placeholder="123456" required/></div></label> : null}
          {!otpMode ? <label>Password<div><Icon name="lock"/><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={4} placeholder="Minimum 4 characters" required/><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name="eye"/></button></div></label> : null}
          {mode === "signin" && !otpMode ? <div className="px-auth-options"><label><input type="checkbox" defaultChecked/>Remember me</label><button type="button" onClick={() => setError(`Demo ${role} account: use any email and a password with 4+ characters.`)}>Forgot password?</button></div> : null}
          {error ? <p className="px-auth-error" role="alert">{error}</p> : null}
          <button className="px-btn px-btn-red px-auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : otpMode ? otpSent ? "Verify OTP" : "Send demo OTP" : mode === "signin" ? `Sign in as ${role}` : role === "seller" ? "Submit seller application" : "Create customer account"}<Icon name="arrow"/></button>
          {mode === "signin" && role === "customer" ? <button className="px-auth-otp" type="button" onClick={() => { setOtpMode((active) => !active); setOtpSent(false); setError(""); }}>{otpMode ? "Use email and password" : "Sign in with phone OTP"}</button> : null}
        </form>
        <p className="px-auth-demo"><b>DEMO ACCESS</b> {role === "seller" ? "Any seller email + a 4-character password opens an approved demo store. New registrations enter pending approval." : <>Any email + a 4-character password, or OTP <strong>123456</strong>.</>} Firebase Auth can replace this adapter later.</p>
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
