"use client";

import Image from "next/image";
import Link from "next/link";
import { appRole } from "@/lib/app-role";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { deliveryCall, deliveryDate, deliveryLabels, isActiveDelivery, navigationLink, phoneLink, rideTrackingId, useRiderJobs, type RiderDelivery } from "@/lib/rider";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import { DeliveryMap } from "./delivery-map";
import { earningDistance, earningPaid, earningsSummary, recordedEarning, riderMoney, riderPolicy, type EarningsPeriod } from "@/lib/rider-earnings";

type Workspace = ReturnType<typeof useRiderJobs>;
const RiderContext = createContext<Workspace | null>(null);
function useRider() { const value = useContext(RiderContext); if (!value) throw new Error("Rider workspace is required"); return value; }

export function RiderShell({ children }: { children: React.ReactNode }) {
  const { user, signOut, enableNotifications, notificationsEnabled, notificationError } = usePartX();
  const workspace = useRiderJobs(user?.id);
  const { profile, jobs, loaded, error } = workspace;
  const pathname = usePathname().replace(/\/$/, "");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState("");
  const previousJobs = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const active = jobs.find((job) => job.id === profile?.activeDeliveryId && isActiveDelivery(job.state));
  useEffect(() => {
    const online = () => setConnected(true); const offline = () => setConnected(false);
    queueMicrotask(() => setConnected(navigator.onLine));
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);
  useEffect(() => {
    if (!user?.id || !profile?.active || !profile.online) return;
    const heartbeat = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void updateDoc(doc(firestore, "riders", user.id), { online: true, lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => setActionError("Could not refresh your availability. Check your connection."));
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 45_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", heartbeat); };
  }, [user?.id, profile?.active, profile?.online]);
  useEffect(() => {
    if (!loaded) return;
    const ids = new Set(jobs.map((job) => job.id));
    const newJob = previousJobs.current ? jobs.find((job) => job.state === "ASSIGNED" && !previousJobs.current!.has(job.id)) : undefined;
    previousJobs.current = ids;
    if (!newJob) return;
    queueMicrotask(() => setNotice(`New pickup assigned from ${newJob.storeName}.`));
    if (audio.current?.state === "running") {
      const sound = audio.current.createOscillator(); const gain = audio.current.createGain();
      sound.connect(gain); gain.connect(audio.current.destination); gain.gain.value = 0.08; sound.frequency.value = 660;
      sound.start(); sound.stop(audio.current.currentTime + 0.6);
    }
  }, [jobs, loaded]);
  const toggleOnline = async () => {
    if (!user || !profile) return;
    setBusy(true); setActionError("");
    try { await updateDoc(doc(firestore, "riders", user.id), { online: !profile.online, lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
    catch { setActionError("Availability could not be saved. Check your connection and try again."); }
    finally { setBusy(false); }
  };
  return <RiderContext.Provider value={workspace}><div className="rx-app">
    <header className="rx-header"><Link href="/rider" className="rx-brand"><Image src="/brand/partx-light.png" alt="" width={40} height={40}/><span>Part<b>X</b><small>RIDER</small></span></Link><div className="rx-header-right"><button className={`rx-availability ${profile?.online && connected ? "is-online" : ""}`} type="button" role="switch" aria-checked={Boolean(profile?.online)} disabled={!profile?.active || busy || !connected} onClick={() => void toggleOnline()}><i/>{profile?.online ? "Online" : "Offline"}</button><button className="rx-icon" type="button" onClick={() => void signOut()} aria-label="Sign out"><Icon name="logout"/></button></div></header>
    <nav className="rx-navigation" aria-label="Rider navigation">{[["/rider", "home", "Deliveries"], ["/rider/earnings", "wallet", "Earnings"], ["/rider/history", "orders", "History"], ["/rider/profile", "user", "Profile"]].map(([href, icon, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={pathname === href ? "active" : ""}><Icon name={icon}/>{label}</Link>)}</nav>
    <main className="rx-main">
      {!connected ? <p className="rx-error" role="alert">You are offline. Reconnect before updating a delivery. Location sharing is paused.</p> : null}
      {error || actionError ? <p className="rx-error" role="alert">{error || actionError}</p> : null}
      {notice ? <div className="rx-notice" role="status"><Icon name="bell"/>{notice}<button type="button" className="rx-link" onClick={() => setNotice("")}>Dismiss</button></div> : null}
      {!loaded ? <div className="rx-empty">Loading your rider workspace…</div> : !profile?.active ? <div className="rx-empty"><Icon name="user"/><h1>{profile?.activationPending ? "Your rider account is pending activation" : "Your rider access is not active"}</h1><p>{profile?.activationPending ? "PartX operations will review your account. You can go online and receive deliveries once they activate it." : "Contact PartX operations to activate your account."}</p></div> : <>
        {active ? <div className="rx-reservation-note"><p>You have an unfinished delivery: <b>{active.orderId}</b>. Complete it or arrange its return with the store before accepting a new pickup.</p>{pathname !== "/rider" ? <Link href="/rider">Open delivery</Link> : null}</div> : null}
        {active?.state === "PICKED_UP" ? <RiderLocationSharing key={active.id} delivery={active}/> : null}
        {children}
      </>}
      {profile?.active && <section className="rx-alert-settings"><div><Icon name="bell"/><span><b>Stay ready for your next pickup</b><small>{appRole === "rider" ? "Keep this app open for live assignments. Enable sound for this session." : notificationsEnabled ? "Push notifications enabled. Enable sound for this session." : "Enable assignment notifications and sound."}</small></span></div><button className="rx-secondary" type="button" onClick={() => {
        try { if (!audio.current && "AudioContext" in window) audio.current = new AudioContext(); void audio.current?.resume().catch(() => undefined); } catch { /* Push alerts can still work without browser audio. */ }
        if (appRole === "rider") { setNotice("Assignment sound enabled for this session. Keep the app open to receive live updates."); return; }
        void enableNotifications().then((enabled) => setNotice(enabled ? "Assignment notifications enabled. Sound is available while this portal is open." : "Check notification permissions to receive assignment alerts.")).catch(() => setNotice("Notifications could not be enabled. Check your browser settings and try again."));
      }}>Enable alerts</button>{notificationError ? <p role="status">{notificationError}</p> : null}</section>}
    </main><footer className="rx-footer">PartX Rider · Every part, delivered.</footer>
  </div></RiderContext.Provider>;
}

function RiderLocationSharing({ delivery }: { delivery: RiderDelivery }) {
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("Share your location so the customer can follow this delivery.");
  const [lastSent, setLastSent] = useState<number>();
  useEffect(() => {
    if (!sharing) return;
    if (!navigator.geolocation) { queueMicrotask(() => { setMessage("Location sharing is not supported by this browser."); setSharing(false); }); return; }
    let watcher: number | undefined;
    let refresh: number | undefined;
    let stopped = false; let lastWrite = 0; let inFlight = false;
    const stop = () => { if (watcher !== undefined) navigator.geolocation.clearWatch(watcher); if (refresh !== undefined) window.clearInterval(refresh); watcher = undefined; refresh = undefined; };
    const start = () => {
      stop();
      if (document.visibilityState !== "visible" || !navigator.onLine) { setMessage("Sharing paused. Keep this portal open and reconnect to resume."); return; }
      setMessage("Getting your GPS location…");
      const received = (position: GeolocationPosition) => {
        if (stopped || document.visibilityState !== "visible" || !navigator.onLine || inFlight || Date.now() - lastWrite < 10_000) return;
        if (Date.now() - position.timestamp > 20_000) { setMessage("Waiting for a fresh GPS fix…"); return; }
        if (position.coords.accuracy > 1000) { setMessage("GPS accuracy is too low. Move outdoors and try again."); return; }
        inFlight = true;
        void setDoc(doc(firestore, "deliveries", delivery.id, "location", "current"), {
          riderId: delivery.riderId, latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: position.coords.accuracy, updatedAt: serverTimestamp(),
        }).then(() => { if (!stopped) { lastWrite = Date.now(); setLastSent(lastWrite); setMessage(position.coords.accuracy > 100 ? "Location shared · GPS accuracy is limited" : "Your location is being shared with this customer."); } })
          .catch(() => { if (!stopped) setMessage("Location could not be shared. Check your connection and retry."); })
          .finally(() => { inFlight = false; });
      };
      const failed = (error: GeolocationPositionError) => {
        if (stopped) return;
        setMessage(error.code === 1 ? "Location permission denied. Allow location in your browser settings, then retry." : "GPS unavailable. Check location settings and move to an open area.");
        if (error.code === 1) { stop(); setSharing(false); }
      };
      const options = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };
      watcher = navigator.geolocation.watchPosition(received, failed, options);
      // Obtain fresh fixes while stationary too; never re-stamp an old coordinate.
      refresh = window.setInterval(() => navigator.geolocation.getCurrentPosition(received, failed, options), 15_000);
    };
    start(); document.addEventListener("visibilitychange", start); window.addEventListener("online", start); window.addEventListener("offline", start);
    return () => { stopped = true; stop(); document.removeEventListener("visibilitychange", start); window.removeEventListener("online", start); window.removeEventListener("offline", start); };
  }, [sharing, delivery.id, delivery.riderId]);
  return <section className="rx-location-sharing"><div><Icon name="pin"/><span><b>{sharing ? "Location sharing enabled" : "Start live tracking"}</b><small aria-live="polite">{message}</small>{lastSent ? <small>Last sent {deliveryDate(lastSent)}</small> : null}</span></div><button type="button" className={sharing ? "rx-secondary" : "rx-primary"} onClick={() => setSharing((value) => !value)}>{sharing ? "Pause sharing" : "Share location"}</button><p>Keep this portal open during delivery. Sharing may pause when you lock your phone or switch apps.</p></section>;
}

export function RiderHomePage() {
  const { jobs, profile } = useRider();
  const { user } = usePartX();
  const active = jobs.find((job) => job.id === profile?.activeDeliveryId && isActiveDelivery(job.state));
  const today = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata" }).format(new Date());
  const deliveredToday = jobs.filter((job) => job.state === "DELIVERED" && job.deliveredAt && new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata" }).format(new Date(job.deliveredAt)) === today);
  return <><div className="rx-page-title"><span>YOUR DELIVERY DESK</span><h1>Let’s get moving, {user?.name.split(" ")[0]}.</h1><p>{active ? "Your next stop is ready below." : profile?.online ? "You’re available. New assignments will appear here." : "Go online when you’re ready to receive assignments."}</p></div><div className="rx-stats"><div><span>Active delivery</span><b>{active ? "01" : "00"}</b></div><div><span>Delivered today</span><b>{String(deliveredToday.length).padStart(2, "0")}</b></div><div><span>COD collected today</span><b>₹{deliveredToday.reduce((sum, job) => sum + (job.codCollected ? job.codAmount : 0), 0).toLocaleString("en-IN")}</b></div></div>{active ? <RiderJob key={active.id} delivery={active}/> : <section className="rx-empty"><span className="rx-empty-icon"><Icon name="box"/></span><h2>{profile?.online ? "Ready for the next pickup" : "You’re currently offline"}</h2><p>{profile?.online ? "Keep this page open. A seller can assign you an order when it’s packed." : "Use the online switch above to make yourself available."}</p></section>}</>;
}

function RiderJob({ delivery }: { delivery: RiderDelivery }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [reason, setReason] = useState(""); const [showReason, setShowReason] = useState<"decline" | "issue" | null>(null);
  const [code, setCode] = useState(""); const [cashCollected, setCashCollected] = useState(false); const [itemsChecked, setItemsChecked] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const returning = delivery.kind === "return";
  const replacing = delivery.kind === "replacement";
  const exchanged = Boolean(delivery.exchangeAt);
  const pickupAtCustomer = returning && delivery.state === "ACCEPTED";
  const exchangeAtCustomer = replacing && delivery.state === "PICKED_UP" && !exchanged;
  const returnAtStore = delivery.state === "PICKED_UP" && (returning || (replacing && exchanged));
  const handoverAction = pickupAtCustomer ? "pickup" : exchangeAtCustomer ? "exchange" : "complete";
  const handoverText = pickupAtCustomer ? "Collect the return from the customer."
    : exchangeAtCustomer ? "Hand over the replacement and collect the original item at the same stop."
    : returnAtStore ? "Hand the original item back to the store and ask for its receipt code."
    : "Hand the parts to the customer and ask for their delivery code.";
  const act = async (action: string) => {
    setBusy(true); setError(""); setMessage("");
    try { await deliveryCall("updatePartXDelivery", { deliveryId: delivery.id, action, reason, code, handoverConfirmed: confirmation, codCollected: cashCollected }); setShowReason(null); setReason(""); setCode(""); setConfirmation(false); setMessage(action === "issue" ? "Issue sent to the seller. Keep the order safe and contact the store." : "Delivery updated."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update delivery."); }
    finally { setBusy(false); }
  };
  return <article className="rx-job"><header><div><span>ORDER {delivery.orderId}</span><h2>{returning ? "Return ride" : replacing ? "Replacement ride" : "Delivery ride"}</h2>
    <p>{rideTrackingId(delivery)}{delivery.pickupId && <><br/>Pickup ID {delivery.pickupId}</>}</p><p>Assigned {deliveryDate(delivery.assignedAt)}</p></div><span className="rx-status">{deliveryLabels[delivery.state]}</span></header>
    <div className="rx-job-grid"><section><div className="rx-stops"><Stop label="PICKUP" name={returning ? delivery.customer.name : delivery.storeName} point={delivery.pickup} phone={returning ? delivery.customer.phone : delivery.storePhone}/>
    <Stop label={returning ? "RETURN TO STORE" : replacing ? "EXCHANGE AT CUSTOMER" : delivery.fulfilment === "garage" ? "GARAGE DELIVERY" : "DELIVERY"} name={returning ? delivery.storeName : delivery.customer.name} point={delivery.destination} phone={returning ? delivery.storePhone : delivery.customer.phone}/>
    {replacing && <Stop label="RETURN ORIGINAL TO STORE" name={delivery.storeName} point={delivery.pickup} phone={delivery.storePhone}/>}</div><div className="rx-items"><h3>Items to collect · {delivery.items.reduce((sum, item) => sum + item.quantity, 0)} units</h3>{delivery.items.map((item, index) => <div key={index}><Icon name="box"/><span><b>{item.name}</b><small>{item.partNumber || "No part number"}</small></span><strong>×{item.quantity}</strong></div>)}</div></section>
    <aside><div className={`rx-payment ${delivery.codAmount > 0 ? "is-cod" : ""}`}><Icon name="orders"/><span>{delivery.codAmount > 0 ? "COLLECT FROM CUSTOMER" : "PAYMENT"}</span><b>{delivery.codAmount > 0 ? `₹${delivery.codAmount.toLocaleString("en-IN")}` : "No cash to collect"}</b><small>{delivery.codAmount > 0 ? "Cash on delivery · Record collection before completion" : delivery.razorpayTest ? "Razorpay test payment confirmed · Test ride" : "No payment needs to be collected"}</small></div>
      {delivery.earnings ? <div className="rx-earning-preview">Delivery earnings <b>{riderMoney(delivery.earnings.amountPaise)}</b>{delivery.earnings.pricing ? <small>{earningDistance(delivery.earnings)}</small> : null}<small>Payable by {delivery.earnings.payer === "store" ? delivery.storeName : "PartX"} after successful delivery.</small></div> : null}
      {delivery.issue ? <p className="rx-notice"><b>Issue reported</b><br/>{delivery.issue.reason}<br/><small>{deliveryDate(delivery.issue.reportedAt)}</small></p> : null}
      {delivery.state === "ASSIGNED" ? <div className="rx-job-actions"><button className="rx-primary" disabled={busy} onClick={() => void act("accept")}>Accept delivery <Icon name="arrow"/></button><button className="rx-secondary" disabled={busy} onClick={() => setShowReason("decline")}>Decline assignment</button></div> : null}
      {delivery.state === "ACCEPTED" && !returning ? <div className="rx-job-actions"><label className="rx-checkbox"><input type="checkbox" checked={itemsChecked} onChange={(event) => setItemsChecked(event.target.checked)}/>I checked every item and quantity at the store.</label><button className="rx-primary" disabled={busy || !itemsChecked} onClick={() => void act("pickup")}>{busy ? "Saving…" : "Confirm pickup"}<Icon name="check"/></button></div> : null}
      {pickupAtCustomer || delivery.state === "PICKED_UP" ? <form className="rx-complete" onSubmit={(event) => { event.preventDefault(); void act(handoverAction); }}>
        <h3>{pickupAtCustomer ? "Confirm return pickup" : exchangeAtCustomer ? "Confirm the exchange" : returnAtStore ? "Confirm store receipt" : "Confirm delivery"}</h3>
        <p>{handoverText}</p>
        <label>{returnAtStore ? "Store receipt code" : "Customer’s confirmation code"}<input className="rx-otp-input" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} minLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}/></label>
        <label className="rx-checkbox"><input type="checkbox" checked={confirmation} onChange={(event) => setConfirmation(event.target.checked)}/>{exchangeAtCustomer ? "I handed over the replacement and collected the original." : "The handover is complete and I checked the item and quantity."}</label>
        {delivery.codAmount > 0 && <label className="rx-checkbox"><input type="checkbox" checked={cashCollected} onChange={(event) => setCashCollected(event.target.checked)}/>Cash collected from customer</label>}
        <button className="rx-primary" type="submit" disabled={busy || !confirmation || code.length !== 6 || (delivery.codAmount > 0 && !cashCollected)}>{busy ? "Saving…" : "Confirm handover"}</button>
      </form> : null}
      {delivery.state !== "ASSIGNED" ? <button type="button" className="rx-link" onClick={() => setShowReason("issue")}>Customer unreachable or another issue?</button> : null}
      {showReason ? <form className="rx-reason-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void act(showReason); }}><label>{showReason === "decline" ? "Reason for declining" : "Describe the delivery issue"}<textarea required minLength={showReason === "decline" ? 5 : 10} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add details for the seller"/></label><div><button type="button" className="rx-secondary" onClick={() => setShowReason(null)}>Cancel</button><button className="rx-primary" disabled={busy} type="submit">{busy ? "Sending…" : "Send to seller"}</button></div></form> : null}
      {error ? <p className="rx-error" role="alert">{error}</p> : null}{message ? <p className="rx-notice" role="status">{message}</p> : null}
    </aside></div>{delivery.state === "PICKED_UP" ? <DeliveryMap delivery={delivery}/> : null}
  </article>;
}

function Stop({ label, name, point, phone }: { label: string; name: string; point: RiderDelivery["pickup"]; phone: string }) {
  return <div className="rx-stop"><i><Icon name={label === "PICKUP" ? "store" : "pin"}/></i><div><span>{label}</span><h3>{name}</h3><p>{point.address}</p><div className="rx-stop-links"><a href={navigationLink(point)} target="_blank" rel="noopener noreferrer"><Icon name="arrow"/>Navigate</a>{phone ? <a href={phoneLink(phone)}><Icon name="phone"/>Call</a> : <small>Phone not provided</small>}</div></div></div>;
}

export function RiderHistoryPage() {
  const { jobs } = useRider();
  const history = jobs.filter((job) => !isActiveDelivery(job.state));
  return <><div className="rx-page-title"><span>YOUR DELIVERY RECORD</span><h1>Delivery history</h1><p>Completed deliveries and closed assignments, with exact timestamps.</p></div><div className="rx-history">{history.map((job) => <article className="rx-card" key={job.id}><header><span>{rideTrackingId(job)}</span><b className="rx-status">{deliveryLabels[job.state]}</b></header><h2>{job.storeName}</h2><p>{job.destination.address}</p><div>{job.items.map((item, index) => <span className="rx-history-item" key={index}>{item.name} ×{item.quantity}</span>)}</div><footer><span>{deliveryDate(job.deliveredAt ?? job.closedAt)}</span><b>{job.codCollected ? `COD collected ₹${job.codAmount.toLocaleString("en-IN")}` : job.state === "DELIVERED" ? "Prepaid" : job.closedReason}</b></footer></article>)}{!history.length ? <div className="rx-empty"><Icon name="orders"/><h2>No completed deliveries yet</h2><p>Your delivery history will appear here after your first job.</p></div> : null}</div></>;
}

export function RiderEarningsPage() {
  const { jobs, profile, error } = useRider();
  const [period, setPeriod] = useState<EarningsPeriod>("month");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    queueMicrotask(refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const summary = earningsSummary(jobs, period, now);
  const policy = riderPolicy(profile?.earningsPolicy);
  const hasRate = policy.mode === "per_km" ? Number.isSafeInteger(policy.ratePaisePerKm) && policy.ratePaisePerKm >= 0 : Number.isSafeInteger(policy.amountPaise) && policy.amountPaise >= 0;
  const rateLabel = policy.mode === "per_km" ? `${riderMoney(policy.ratePaisePerKm)} per km${policy.returnIncluded ? " · Return included" : ""}` : `${riderMoney(policy.amountPaise)} per completed delivery`;
  return <><div className="rx-page-title"><span>YOUR DELIVERY EARNINGS</span><h1>Earnings</h1><p>Your delivery earnings, payment status and cash collections in one place. Totals follow delivery dates in India time.</p></div>
    <div className="rx-earnings-filters" role="group" aria-label="Earnings period">{([["today", "Today"], ["week", "Last 7 days"], ["month", "This month"], ["all", "All time"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div>
    {error ? <p className="rx-error">Earnings may be incomplete while your delivery records are unavailable.</p> : null}
    <div className="rx-stats rx-earnings-stats"><div><span>Earned</span><b>{riderMoney(summary.earnedPaise)}</b><small>From completed deliveries</small></div><div><span>Awaiting payment</span><b>{riderMoney(summary.pendingPaise)}</b><small>Earned, payment not confirmed</small></div><div><span>Paid</span><b>{riderMoney(summary.paidPaise)}</b><small>Recorded payment confirmations</small></div><div><span>Completed deliveries</span><b>{summary.completed.length}</b><small>In the selected period</small></div></div>
    <section className="rx-card rx-earnings-policy"><Icon name="wallet"/><div><h2>{hasRate ? rateLabel : "Your delivery rate needs confirmation"}</h2><p>{hasRate ? `Paid by ${policy.payer === "partx" ? "PartX" : "the store"}. ${policy.mode === "per_km" ? "The seller enters the one-way road distance. Check the full distance and payout before accepting. " : ""}Each assignment keeps its agreed rate.` : "Contact PartX operations to confirm your commission rate. Deliveries without a recorded rate are excluded from earnings totals."}</p></div></section>
    {summary.unrecorded ? <p className="rx-notice">{summary.unrecorded} completed {summary.unrecorded === 1 ? "delivery has" : "deliveries have"} no recorded earning rate. Contact PartX operations to reconcile {summary.unrecorded === 1 ? "it" : "them"}.</p> : null}
    <section className="rx-earnings-ledger" aria-label="Delivery earnings"><div className="rx-earnings-heading"><h2>Delivery breakdown</h2><span>{summary.completed.length} completed</span></div>{summary.completed.length ? <div className="rx-earning-list">{summary.completed.map((job) => {
      const earning = recordedEarning(job); const paid = earning && earningPaid(earning);
      return <article className="rx-card rx-earning-row" key={job.id}><div className="rx-earning-order"><span>{job.orderId}</span><h3>{job.storeName}</h3><p>{deliveryDate(job.deliveredAt)}</p><small>{job.items.map((item) => `${item.name} ×${item.quantity}`).join(" · ")}</small>{earning?.pricing ? <small>{earningDistance(earning)}</small> : null}</div><div className="rx-earning-amount"><strong>{earning ? riderMoney(earning.amountPaise) : "Rate not recorded"}</strong><span className={`rx-status ${paid ? "is-paid" : "is-pending"}`}>{earning ? paid ? "Paid" : "Awaiting payment" : "Needs rate confirmation"}</span>{earning ? <small>{paid ? `Paid ${deliveryDate(earning.paidAt)}` : `Payable by ${earning.payer === "partx" ? "PartX" : job.storeName}`}</small> : null}</div><div className="rx-earning-cash"><Icon name="orders"/><span>{job.codCollected ? `${riderMoney(Math.round(job.codAmount * 100))} cash collected for store` : "Prepaid order · No cash collected"}</span></div></article>;
    })}</div> : <div className="rx-empty"><Icon name="wallet"/><h2>No completed deliveries in this period</h2><p>Complete a delivery to see its earnings here. You can also choose another time period.</p></div>}</section>
    <section className="rx-card rx-earnings-cash-summary"><div><span>COD cash collected</span><b>{riderMoney(summary.codPaise)}</b></div><p>Customer cash belongs to the store and is shown separately from your earnings. Settlement to the store is not tracked here yet. Earnings are marked paid only after an operations payment confirmation; this page does not transfer money.</p></section>
  </>;
}

export function RiderProfilePage() {
  const { user, signOut } = usePartX(); const { profile } = useRider();
  return <><div className="rx-page-title"><span>PARTX RIDER</span><h1>Your profile</h1><p>Your rider details are managed by PartX operations.</p></div><section className="rx-card rx-profile"><div className="rx-avatar">{user?.name.slice(0, 1)}</div><h2>{profile?.name || user?.name}</h2><dl><div><dt>Email</dt><dd>{user?.email}</dd></div><div><dt>Phone</dt><dd>{profile?.phone || user?.mobile || "Not provided"}</dd></div><div><dt>Rider ID</dt><dd>{user?.id}</dd></div><div><dt>Account</dt><dd>{profile?.active ? "Active" : "Access paused"}</dd></div></dl><p>For changes to your contact details or delivery support, contact PartX operations through your assigned seller.</p><button type="button" className="rx-secondary" onClick={() => void signOut()}>Sign out</button></section></>;
}
