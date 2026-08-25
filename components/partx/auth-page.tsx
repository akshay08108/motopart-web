"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";

type AuthMode = "signin" | "register";

export function CustomerAuthPage() {
  const router = useRouter();
  const { signIn, register } = usePartX();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    let success = false;
    if (mode === "register") {
      success = await register({ name: String(data.get("name")), email: String(data.get("email")), mobile: String(data.get("mobile")), password: String(data.get("password")) });
    } else if (otpMode) {
      const mobile = String(data.get("mobile"));
      const otp = String(data.get("otp"));
      if (!otpSent) {
        setOtpSent(true);
        setBusy(false);
        return;
      }
      success = otp === "123456" && await signIn(mobile, "otp-demo");
    } else {
      success = await signIn(String(data.get("identifier")), String(data.get("password")));
    }
    setBusy(false);
    if (success) router.replace("/account");
    else setError(otpMode ? "Enter demo OTP 123456 to continue." : "Please check the fields and try again.");
  };

  const changeMode = (next: AuthMode) => { setMode(next); setOtpMode(false); setOtpSent(false); setError(""); };

  return <main className="px-auth">
    <section className="px-auth-story">
      <Link href="/" className="px-auth-brand" aria-label="PartX home"><Image src="/brand/partx-dark.png" alt="" width={58} height={58} priority/><span>Part<b>X</b></span></Link>
      <div className="px-auth-message"><span>CUSTOMER ACCESS</span><h1>Your garage.<br/>Your parts.<br/><em>One account.</em></h1><p>Save vehicles, compare verified stores and track every order.</p></div>
      <Image className="px-auth-part" src="/parts/0-v2.png" alt="Bosch brake parts" width={720} height={520} priority/>
      <div className="px-auth-proof"><div><Icon name="check"/><span><b>Verified fitment</b>Shop confidently</span></div><div><Icon name="store"/><span><b>Compare sellers</b>You choose the price</span></div><div><Icon name="orders"/><span><b>Live tracking</b>Every order update</span></div></div>
    </section>
    <section className="px-auth-panel">
      <Link href="/" className="px-auth-mobile-brand" aria-label="PartX home"><Image src="/brand/partx-light.png" alt="" width={48} height={48} priority/><span>Part<b>X</b></span></Link>
      <div className="px-auth-form-wrap">
        <div className="px-auth-heading"><span>PARTX CUSTOMER ACCOUNT</span><h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2><p>{mode === "signin" ? "Sign in to see your garage, orders and saved details." : "Start comparing sellers and tracking your parts in one place."}</p></div>
        <div className="px-auth-tabs" role="tablist"><button type="button" className={mode === "signin" ? "active" : ""} onClick={() => changeMode("signin")}>Sign in</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Create account</button></div>
        <form className="px-auth-form" onSubmit={complete}>
          {mode === "register" ? <label>Full name<div><Icon name="user"/><input name="name" autoComplete="name" placeholder="Your full name" required/></div></label> : null}
          {mode === "signin" && !otpMode ? <label>Email or mobile number<div><Icon name="mail"/><input name="identifier" autoComplete="username" placeholder="you@example.com" required/></div></label> : null}
          {mode === "register" ? <label>Email address<div><Icon name="mail"/><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></div></label> : null}
          {mode === "register" || otpMode ? <label>Mobile number<div><Icon name="phone"/><input name="mobile" type="tel" autoComplete="tel" placeholder="+91 98765 43210" required/></div></label> : null}
          {otpMode && otpSent ? <label>6-digit OTP<div><Icon name="lock"/><input name="otp" inputMode="numeric" maxLength={6} placeholder="123456" required/></div></label> : null}
          {!otpMode ? <label>Password<div><Icon name="lock"/><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={4} placeholder="Minimum 4 characters" required/><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name="eye"/></button></div></label> : null}
          {mode === "signin" && !otpMode ? <div className="px-auth-options"><label><input type="checkbox" defaultChecked/>Remember me</label><button type="button" onClick={() => setError("Demo account: use any email and a password with 4+ characters.")}>Forgot password?</button></div> : null}
          {error ? <p className="px-auth-error" role="alert">{error}</p> : null}
          <button className="px-btn px-btn-red px-auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : otpMode ? otpSent ? "Verify OTP" : "Send demo OTP" : mode === "signin" ? "Sign in" : "Create account"}<Icon name="arrow"/></button>
          {mode === "signin" ? <button className="px-auth-otp" type="button" onClick={() => { setOtpMode((active) => !active); setOtpSent(false); setError(""); }}>{otpMode ? "Use email and password" : "Sign in with phone OTP"}</button> : null}
        </form>
        <p className="px-auth-demo"><b>DEMO ACCESS</b> Any email + a 4-character password, or OTP <strong>123456</strong>. Firebase Auth can replace this local adapter later.</p>
      </div>
    </section>
  </main>;
}
