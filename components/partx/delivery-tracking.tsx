"use client";

import { useEffect, useState } from "react";
import { deliveryCall, deliveryDate, deliveryLabels, phoneLink, useDelivery } from "@/lib/rider";
import { usePartX } from "./app-provider";
import { DeliveryMap } from "./delivery-map";
import { Icon } from "./icons";

export function DeliveryTracking({ deliveryId }: { deliveryId?: string }) {
  const { user } = usePartX();
  const { delivery, error: loadError } = useDelivery(deliveryId, user?.id);
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { queueMicrotask(() => { setCode(null); setError(""); setExpanded(false); }); }, [deliveryId]);
  if (!deliveryId) return null;
  if (!delivery) return loadError ? <p className="rx-error" role="alert">{loadError}</p> : <p className="rx-notice">Loading your rider details…</p>;
  const pickedUp = delivery.state === "PICKED_UP";
  const active = ["ASSIGNED", "ACCEPTED", "PICKED_UP"].includes(delivery.state);
  return <section className="rx-customer-tracking"><header><div><span>PARTX DELIVERY</span><h2>{deliveryLabels[delivery.state]}</h2><p>{active ? `${delivery.riderName} is your delivery rider.` : delivery.state === "DELIVERED" ? `Delivered ${deliveryDate(delivery.deliveredAt)}` : "Your seller will update you about the next assignment."}</p></div>{active ? <button className="rx-primary" type="button" onClick={() => setExpanded((value) => !value)}><Icon name="pin"/>{expanded ? "Hide map" : "Track delivery"}</button> : null}</header>
    {active ? <div className="rx-rider-contact"><span><Icon name="user"/>{delivery.riderName}</span>{delivery.riderPhone ? <a href={phoneLink(delivery.riderPhone)}><Icon name="phone"/>Call rider</a> : null}</div> : null}
    {delivery.issue && active ? <p className="rx-notice">Your rider reported a delivery issue. Your seller has been notified.</p> : null}
    {pickedUp ? <div className="rx-customer-otp"><div><b>Delivery confirmation code</b><p>Share this code only when your parts arrive and you have checked them.{delivery.codAmount > 0 ? ` Pay ₹${delivery.codAmount.toLocaleString("en-IN")} in cash before confirming.` : ""}</p></div>{code ? <div className="rx-code-display"><strong aria-label={`Delivery code ${code.code.split("").join(" ")}`}>{code.code}</strong><small>Valid until {deliveryDate(code.expiresAt)}</small></div> : null}<button type="button" className="rx-secondary" disabled={busy} onClick={() => {
      setBusy(true); setError("");
      void deliveryCall<{ code: string; expiresAt: number }>("getPartXDeliveryCode", { deliveryId: delivery.id }).then(setCode).catch((reason) => setError(reason.message)).finally(() => setBusy(false));
    }}>{busy ? "Loading…" : code ? "Refresh delivery code" : "Show delivery code"}</button>{error ? <p className="rx-error" role="alert">{error}</p> : null}</div> : null}
    {expanded && active ? <DeliveryMap delivery={delivery}/> : null}
  </section>;
}
