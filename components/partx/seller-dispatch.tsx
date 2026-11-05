"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { SellerOrder } from "@/lib/types";
import { deliveryCall, deliveryDate, deliveryLabels, isActiveDelivery, phoneLink, timestampMillis, useDelivery, type RiderProfile } from "@/lib/rider";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";

export function SellerDispatch({ order }: { order: SellerOrder }) {
  const { user } = usePartX();
  const { delivery, error: deliveryError } = useDelivery(order.riderDeliveryId, user?.id);
  const [riders, setRiders] = useState<RiderProfile[]>([]); const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [now, setNow] = useState(0);
  const [action, setAction] = useState<"cancel" | "returned" | null>(null); const [reason, setReason] = useState("");
  const active = delivery && isActiveDelivery(delivery.state);
  useEffect(() => {
    if (!user?.id || order.fulfilment === "pickup" || order.status !== "Packed") return;
    const updateClock = () => setNow(Date.now()); queueMicrotask(updateClock);
    const timer = window.setInterval(updateClock, 20_000);
    const stop = onSnapshot(query(collection(firestore, "riders"), where("active", "==", true)), (snapshot) => {
      setRiders(snapshot.docs.map((item) => ({ ...item.data(), id: item.id, lastSeenAt: timestampMillis(item.data().lastSeenAt) }) as RiderProfile));
    }, () => setError("Available riders could not load. Check your connection."));
    return () => { stop(); window.clearInterval(timer); };
  }, [user?.id, order.fulfilment, order.status]);
  if (order.fulfilment === "pickup" || (!order.riderDeliveryId && order.status !== "Packed")) return null;
  const available = riders.filter((rider) => rider.online && !rider.activeDeliveryId && rider.lastSeenAt && now - rider.lastSeenAt < 120_000);
  const run = async (data: Record<string, unknown>) => {
    setBusy(true); setError("");
    try { await deliveryCall("dispatchPartXDelivery", data); setAction(null); setReason(""); setSelected(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Delivery could not be updated."); }
    finally { setBusy(false); }
  };
  return <section className="rx-dispatch"><header><div><span>PARTX RIDER</span><h2>{delivery ? deliveryLabels[delivery.state] : "Ready for pickup"}</h2></div><Icon name="box"/></header>
    {active ? <><div className="rx-dispatch-rider"><div><b>{delivery.riderName}</b><small>Assigned {deliveryDate(delivery.assignedAt)}</small></div>{delivery.riderPhone ? <a className="rx-secondary" href={phoneLink(delivery.riderPhone)}><Icon name="phone"/>Call rider</a> : null}</div>{delivery.issue ? <p className="rx-notice"><b>Rider reported an issue</b><br/>{delivery.issue.reason}<br/><small>{deliveryDate(delivery.issue.reportedAt)}</small></p> : null}<p>The rider confirms pickup and completes delivery using the customer’s code.</p>{delivery.state !== "PICKED_UP" ? <button className="rx-link" type="button" onClick={() => setAction("cancel")}>Cancel assignment / choose another rider</button> : delivery.issue ? <button className="rx-link" type="button" onClick={() => setAction("returned")}>Confirm parts returned to store</button> : null}</> : order.status === "Packed" ? <form className="rx-assignment-form" onSubmit={(event) => { event.preventDefault(); void run({ action: "assign", orderId: order.id, riderId: selected }); }}><p>Assign one available rider to collect this packed order.</p><label>Available PartX rider<select required value={selected} onChange={(event) => setSelected(event.target.value)} disabled={busy}><option value="">{available.length ? "Choose a rider" : "No riders online right now"}</option>{available.map((rider) => <option value={rider.id} key={rider.id}>{rider.name} · {rider.phone}</option>)}</select></label>{!available.length ? <small>Ask your rider to sign in to the PartX Rider portal and go online.</small> : null}<button type="submit" className="rx-primary" disabled={busy || !available.some((rider) => rider.id === selected)}>{busy ? "Assigning…" : "Assign rider"}<Icon name="arrow"/></button></form> : delivery?.state === "DELIVERED" ? <p>Delivered {deliveryDate(delivery.deliveredAt)}{delivery.codCollected ? ` · ₹${delivery.codAmount.toLocaleString("en-IN")} cash collected by rider. Settlement to store is pending reconciliation.` : ""}</p> : null}
    {action ? <form className="rx-reason-form" onSubmit={(event) => { event.preventDefault(); void run({ action, deliveryId: delivery!.id, reason }); }}><label>{action === "returned" ? "Confirm you physically received all returned parts. Add details:" : "Reason for cancelling this assignment"}<textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={500}/></label><div><button className="rx-secondary" type="button" onClick={() => setAction(null)}>Keep assignment</button><button className="rx-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Confirm"}</button></div></form> : null}
    {error || deliveryError ? <p className="rx-error" role="alert">{error || deliveryError}</p> : null}
  </section>;
}
