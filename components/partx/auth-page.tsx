"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { appRole, roleHome, roleLogin } from "@/lib/app-role";
import type { UserRole } from "@/lib/types";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import { AuthStoryMotion } from "./auth-story-motion";
import storyStyles from "./auth-story.module.css";

type AuthMode = "signin" | "register" | "reset";

const roleCopy = {
  customer: { label: "CUSTOMER ACCESS", story: <>Your garage.<br/>Your parts.<br/><em>One account.</em></>, storyDescription: "Save vehicles, compare verified stores and track every order.", heading: "Customer account", signInDescription: "Sign in to see your garage, orders and saved details.", registerDescription: "Start comparing sellers and tracking your parts in one place." },
  seller: { label: "SELLER ACCESS", story: <>Your store.<br/>Your orders.<br/><em>One command center.</em></>, storyDescription: "Manage products, prices, packing and customer support.", heading: "Seller account", signInDescription: "Sign in to open your store dashboard and packing queue.", registerDescription: "Create your store, add products and receive orders immediately." },
  rider: { label: "PARTX RIDER", story: <>Pick up.<br/>Deliver.<br/><em>Keep moving.</em></>, storyDescription: "Your assigned deliveries, pickup details and customer destinations in one place.", heading: "Rider portal", signInDescription: "Sign in to view your pickups and deliveries.", registerDescription: "Create a rider account and verify your email to access the app." },
} as const;

export function RoleChoicePage() {
  return <main className={`px-auth px-role-gateway ${storyStyles.auth}`}>
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
  const { signIn, register, resetPassword, user, authHydrated, emailVerified, requestEmailVerification, refreshEmailVerification, signOut } = usePartX();
  const [mode, setMode] = useState<AuthMode>(signupFirst ? "register" : "signin");
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const copy = roleCopy[role];
  const dedicated = appRole !== undefined || role === "rider";
  const sellerSignup = role === "seller" && mode === "register";
  const mustVerifyEmail = role === "customer" || (role === "rider" && user?.riderSelfRegistered);
  const awaitingVerification = user?.activeRole === role && mustVerifyEmail && !emailVerified;

  useEffect(() => {
    if (!authHydrated || !user || user.activeRole !== role || awaitingVerification) return;
    router.replace(roleHome[role]);
  }, [authHydrated, awaitingVerification, role, router, user]);

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (mode === "reset") {
        if (await resetPassword(identifier)) {
          setNotice("If an account exists for this email, you’ll receive a reset link. Check your inbox and spam folder.");
        } else {
          setError("Couldn’t request a reset link. Check your connection and try again.");
        }
      } else if (mode === "register") {
        const success = await register({
          name: String(data.get("name")), email: identifier, mobile: String(data.get("mobile")),
          password: String(data.get("password")), role, storeName: String(data.get("storeName") ?? ""),
        });
        if (!success) setError("Couldn’t create the account. Check your details or sign in if you’ve already registered.");
      } else {
        const result = await signIn(identifier, String(data.get("password")), role, data.has("remember"));
        if (result === "credentials") setError("That email or password didn’t match. Try again or reset your password.");
        if (result === "role") setError(`This account can’t sign in as a ${role}. Use the email you registered for this role.`);
        if (result === "network") setError("Couldn’t connect. Check your internet connection and try again.");
        if (result === "retry") setError("Couldn’t sign in right now. Wait a moment and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const changeMode = (next: AuthMode) => {
    setMode(next);
    setShowPassword(false);
    setError("");
    setNotice("");
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
    return <main className={`px-auth px-auth-${role} ${storyStyles.auth}`}>
      <AuthStory role={role} dedicated={dedicated}/>
      <section className="px-auth-panel">
        <AuthBrand role={role} dedicated={dedicated} mobile/>
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

  return <main className={`px-auth px-auth-${role} ${storyStyles.auth}`}>
    <AuthStory role={role} dedicated={dedicated}/>
    <section className="px-auth-panel">
      <AuthBrand role={role} dedicated={dedicated} mobile/>
      <div className="px-auth-form-wrap">
        {!appRole && role === "customer" && !user && (
          <Link className="px-btn px-btn-outline px-auth-seller-link" href={roleLogin("seller")}><Icon name="store"/>Seller sign in</Link>
        )}
        <div className="px-auth-heading"><span>PARTX {copy.heading.toUpperCase()}</span><h2>{mode === "reset" ? "Reset your password" : mode === "signin" ? (role === "seller" ? "Seller sign in" : "Welcome back") : role === "seller" ? "Create your seller account" : role === "rider" ? "Create your rider account" : "Create your customer account"}</h2><p>{mode === "reset" ? "Enter the email you use for PartX." : mode === "signin" ? copy.signInDescription : copy.registerDescription}</p></div>
        {sellerSignup && <p className="px-auth-mode-switch px-auth-existing-seller">
          <span>Already have a seller account?</span>
          <button className="px-btn px-btn-outline" type="button" disabled={busy} onClick={() => changeMode("signin")}>
            Seller sign in
          </button>
        </p>}
        <form className="px-auth-form" key={mode} onSubmit={complete}>
          {mode === "register" ? <label>Full name<div><Icon name="user"/><input name="name" autoComplete="name" placeholder="Your full name" maxLength={role === "rider" ? 120 : undefined} required/></div></label> : null}
          {mode === "register" && role === "seller" ? <label>Store name<div><Icon name="store"/><input name="storeName" placeholder="Your business name" required/></div></label> : null}
          <label>{role === "seller" && mode === "signin" ? "Seller email" : "Email address"}<div><Icon name="mail"/><input name="email" autoComplete={mode === "signin" ? "username" : "email"} type="email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required/></div></label>
          {mode === "register" && <label>Mobile number<div><Icon name="phone"/><input name="mobile" type="tel" autoComplete="tel" placeholder="+91 98765 43210" required/></div></label>}
          {mode !== "reset" && <label>Password<div><Icon name="lock"/><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "register" ? 6 : undefined} placeholder={mode === "register" ? "At least 6 characters" : "Your password"} required/><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name="eye"/></button></div></label>}
          {mode === "signin" && <div className="px-auth-options"><label><input type="checkbox" name="remember" defaultChecked/>Remember me</label><button type="button" onClick={() => changeMode("reset")} disabled={busy}>Forgot password?</button></div>}
          {error ? <p className="px-auth-error" role="alert">{error}</p> : null}
          {notice ? <p className="px-auth-notice" role="status">{notice}</p> : null}
          <button className="px-btn px-btn-red px-auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "reset" ? "Send reset link" : mode === "signin" ? `Sign in as ${role}` : `Create ${role} account`}<Icon name="arrow"/></button>
        </form>
        {!sellerSignup && <p className="px-auth-options px-auth-mode-switch">
          {mode === "register" ? "Already have an account?" : mode === "signin" ? "New to PartX?" : null}
          <button type="button" disabled={busy} onClick={() => changeMode(mode === "signin" ? "register" : "signin")}>
            {mode === "reset" ? "Back to sign in" : mode === "register" ? "Sign in" : "Create account"}
          </button>
        </p>}
      </div>
    </section>
  </main>;
}

function AuthStory({ role, dedicated = false }: { role: UserRole; dedicated?: boolean }) {
  const copy = roleCopy[role];
  return <section className={`px-auth-story ${storyStyles.story}`}>
    <AuthBrand role={role} dedicated={dedicated}/>
    <div className={`px-auth-message ${storyStyles.message}`}><span>{copy.label}</span><h1>{copy.story}</h1><p>{copy.storyDescription}</p></div>
    <AuthStoryMotion/>
    <div className={`px-auth-proof ${storyStyles.proof}`}>
      <div><Icon name="check"/><span><b>Verified fitment</b>Shop confidently</span></div>
      <div><Icon name="store"/><span><b>Compare sellers</b>You choose the price</span></div>
      <div><Icon name="orders"/><span><b>Live tracking</b>Every order update</span></div>
    </div>
  </section>;
}

function AuthBrand({ role, dedicated, mobile = false }: { role: UserRole; dedicated: boolean; mobile?: boolean }) {
  const className = mobile ? "px-auth-mobile-brand" : "px-auth-brand";
  const size = mobile ? 48 : 58;
  const brand = <><Image src={mobile ? "/brand/partx-light.png" : "/brand/partx-dark.png"} alt="" width={size} height={size} priority/><span>Part<b>X</b>{role === "rider" && <small> Rider</small>}</span></>;
  return dedicated ? <div className={className}>{brand}</div> : <Link href="/" className={className} aria-label={role === "rider" ? "PartX Rider home" : "PartX home"}>{brand}</Link>;
}
