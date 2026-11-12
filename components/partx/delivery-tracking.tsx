"use client";

import { useEffect, useState } from "react";
import { deliveryCall, deliveryDate, deliveryLabels, phoneLink, rideTrackingId, useDelivery } from "@/lib/rider";
import { usePartX } from "./app-provider";
import { DeliveryMap } from "./delivery-map";
import { Icon } from "./icons";

export function DeliveryTracking({ deliveryId }: { deliveryId?: string }) {
  const { user } = usePartX();
  const { delivery, error: loadError } = useDelivery(deliveryId, user?.id);
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: number; regenerateAfter?: number } | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { queueMicrotask(() => { setCode(null); setError(""); setExpanded(false); }); }, [deliveryId, user?.id]);
  useEffect(() => {
    if (!code) return;
    const tick = () => setNow(Date.now()); queueMicrotask(tick);
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [code]);
  if (!deliveryId) return null;
  if (!delivery) return loadError ? <p className="rx-error" role="alert">{loadError}</p> : <p className="rx-notice">Loading your rider details…</p>;
  const returning = delivery.kind === "return";
  const replacing = delivery.kind === "replacement";
  const showCode = returning ? delivery.state === "ACCEPTED" : delivery.state === "PICKED_UP" && !delivery.exchangeAt;
  const active = ["ASSIGNED", "ACCEPTED", "PICKED_UP"].includes(delivery.state);
  const expired = Boolean(code && now >= code.expiresAt);
  const cooldown = code ? Math.max(0, Math.ceil(((code.regenerateAfter ?? 0) - now) / 1000)) : 0;
  const requestCode = (regenerate: boolean) => {
    setBusy(true); setError("");
    void deliveryCall<{ code: string; expiresAt: number; regenerateAfter?: number }>("getPartXDeliveryCode", { deliveryId: delivery.id, regenerate }).then((next) => { setNow(Date.now()); setCode(next); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Delivery code could not load.")).finally(() => setBusy(false));
  };
  return <section className="rx-customer-tracking"><header><div><span>{returning ? "PARTX RETURN" : replacing ? "PARTX REPLACEMENT" : "PARTX DELIVERY"}</span><h2>{delivery.exchangeAt && delivery.state === "PICKED_UP" ? "Exchange confirmed · returning to store" : deliveryLabels[delivery.state]}</h2>
    <p>{rideTrackingId(delivery)}{delivery.pickupId && <><br/>Pickup ID {delivery.pickupId}</>}</p><p>{active ? `${delivery.riderName} is your delivery rider.` : delivery.state === "DELIVERED" ? `Delivered ${deliveryDate(delivery.deliveredAt)}` : "Your seller will update you about the next assignment."}</p></div>{active ? <button className="rx-primary" type="button" onClick={() => setExpanded((value) => !value)}><Icon name="pin"/>{expanded ? "Hide map" : "Track delivery"}</button> : null}</header>
    {active ? <div className="rx-rider-contact"><span><Icon name="user"/>{delivery.riderName}</span>{delivery.riderPhone ? <a href={phoneLink(delivery.riderPhone)}><Icon name="phone"/>Call rider</a> : null}</div> : null}
    {delivery.issue && active ? <p className="rx-notice">Your rider reported a delivery issue. Your seller has been notified.</p> : null}
    {showCode ? <div className="rx-customer-otp"><div><b>Handover confirmation code</b><p>{returning ? "Share this code when the rider takes the return." : replacing ? "Share this code after you receive the replacement and hand the original to the rider." : "Share this code only when your parts arrive and you have checked them."}{delivery.codAmount > 0 ? ` Pay ₹${delivery.codAmount.toLocaleString("en-IN")} in cash before confirming.` : ""}</p></div>{code ? <div className="rx-code-display">{expired ? <b className="rx-code-expired" role="status">Code expired</b> : <strong aria-label={`Delivery code ${code.code.split("").join(" ")}`}>{code.code}</strong>}<small>{expired ? "Generate a new code to finish delivery." : `Valid until ${deliveryDate(code.expiresAt)}`}</small></div> : null}<div className="rx-code-actions">{!code ? <button type="button" className="rx-secondary" disabled={busy} onClick={() => requestCode(false)}>Show delivery code</button> : null}<button type="button" className="rx-secondary" disabled={busy || (!expired && cooldown > 0)} onClick={() => requestCode(true)}>{busy ? "Loading…" : !expired && cooldown > 0 ? `Generate new code (${cooldown}s)` : "Generate new code"}</button></div><p className="rx-code-help">A new code replaces the previous one. The rider stays assigned until delivery is verified or the assignment is closed.</p>{error ? <p className="rx-error" role="alert">{error}</p> : null}</div> : null}
    {expanded && active ? <DeliveryMap delivery={delivery}/> : null}
  </section>;
}
