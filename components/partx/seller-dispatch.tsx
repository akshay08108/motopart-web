"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { SellerOrder } from "@/lib/types";
import { deliveryCall, deliveryDate, deliveryLabels, isActiveDelivery, phoneLink, timestampMillis, useDelivery, rideTrackingId, type AfterSaleRequest, type RiderProfile } from "@/lib/rider";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import { distanceEarningQuote, riderKilometers, riderMoney, riderPolicy } from "@/lib/rider-earnings";

export function SellerDispatch({ order, request }: { order: SellerOrder; request?: AfterSaleRequest }) {
  const { user } = usePartX();
  const deliveryId = request ? request.deliveryId : order.riderDeliveryId;
  const canAssign = request ? request.state === "REQUESTED" : order.fulfilment !== "pickup" && order.status === "Packed";
  const { delivery, error: deliveryError } = useDelivery(deliveryId, user?.id);
  const [receipt, setReceipt] = useState<{ code: string; expiresAt: number } | null>(null);
  const [riders, setRiders] = useState<RiderProfile[]>([]); const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [now, setNow] = useState(0);
  const [action, setAction] = useState<"cancel" | "returned" | null>(null); const [reason, setReason] = useState("");
  const [oneWayDistance, setOneWayDistance] = useState("");
  const active = delivery && isActiveDelivery(delivery.state);
  useEffect(() => {
    if (!user?.id || !canAssign) return;
    const updateClock = () => setNow(Date.now()); queueMicrotask(updateClock);
    const timer = window.setInterval(updateClock, 20_000);
    const stop = onSnapshot(query(collection(firestore, "riders"), where("active", "==", true)), (snapshot) => {
      setRiders(snapshot.docs.map((item) => ({ ...item.data(), id: item.id, lastSeenAt: timestampMillis(item.data().lastSeenAt) }) as RiderProfile));
    }, () => setError("Available riders could not load. Check your connection."));
    return () => { stop(); window.clearInterval(timer); };
  }, [user?.id, canAssign]);
  if (!canAssign && !deliveryId) return null;
  const available = riders.filter((rider) => rider.online && !rider.activeDeliveryId && rider.lastSeenAt && now - rider.lastSeenAt < 120_000);
  const occupied = riders.filter((rider) => rider.online && rider.activeDeliveryId && rider.lastSeenAt && now - rider.lastSeenAt < 120_000);
  const selectedRider = available.find((rider) => rider.id === selected);
  const testOrder = order.paymentMethod === "razorpay" && order.paymentMode === "test";
  const policy = riderPolicy(selectedRider?.earningsPolicy);
  const needsDistance = !testOrder && policy.mode === "per_km";
  const distanceQuote = policy.mode === "per_km" ? distanceEarningQuote(policy, Number(oneWayDistance)) : null;
  const run = async (data: Record<string, unknown>) => {
    setBusy(true); setError("");
    try { await deliveryCall("dispatchPartXDelivery", data); setAction(null); setReason(""); setSelected(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Delivery could not be updated."); }
    finally { setBusy(false); }
  };
  return <section className="rx-dispatch"><header><div><span>{request ? (request.kind === "return" ? "RETURN RIDE" : "REPLACEMENT RIDE") : "PARTX RIDER"}</span><h2>{delivery && (active || !canAssign) ? deliveryLabels[delivery.state] : "Ready for assignment"}</h2>
    {delivery && <p>{rideTrackingId(delivery)}{delivery.pickupId && <><br/>Pickup ID {delivery.pickupId}</>}</p>}</div><Icon name="box"/></header>
    {active ? <><div className="rx-dispatch-rider"><div><b>{delivery.riderName}</b><small>Assigned {deliveryDate(delivery.assignedAt)}</small></div>{delivery.riderPhone ? <a className="rx-secondary" href={phoneLink(delivery.riderPhone)}><Icon name="phone"/>Call rider</a> : null}</div>{delivery.issue ? <p className="rx-notice"><b>Rider reported an issue</b><br/>{delivery.issue.reason}<br/><small>{deliveryDate(delivery.issue.reportedAt)}</small></p> : null}{!request && <p>The rider confirms pickup and completes delivery using the customer’s code.</p>}
    {request && delivery.state === "PICKED_UP" && (request.kind === "return" || delivery.exchangeAt) && <div>
      <p>Check the returned part before giving the rider the store receipt code.</p>
      <button type="button" className="rx-secondary" disabled={busy} onClick={() => {
        setBusy(true); setError("");
        void deliveryCall<{ code: string; expiresAt: number }>("getPartXDeliveryCode", { deliveryId: delivery.id, storeReceipt: true, regenerate: Boolean(receipt) })
          .then(setReceipt).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false));
      }}>{receipt ? "Generate new receipt code" : "Show store receipt code"}</button>
      {receipt && <p role="status"><b>{receipt.code}</b> · Expires {deliveryDate(receipt.expiresAt)}</p>}
    </div>}{delivery.state !== "PICKED_UP" ? <button className="rx-link" type="button" onClick={() => setAction("cancel")}>Cancel assignment / choose another rider</button> : delivery.issue ? <button className="rx-link" type="button" onClick={() => setAction("returned")}>Confirm parts returned to store</button> : null}</> : canAssign ?
      <form className="rx-assignment-form" onSubmit={(event) => { event.preventDefault(); void run({ action: "assign", orderId: order.id, ...(request ? { requestId: request.id } : {}), riderId: selected, ...(needsDistance ? { oneWayDistanceKm: Number(oneWayDistance) } : {}) }); }}>
        {testOrder && <p>Test ride. The rider collects no cash and earns no payable balance.</p>}
        <p>{request ? "Assign a rider when the store is ready to handle this request." : "Assign one available rider to collect this packed order."}</p><label>Available PartX rider<select required value={selected} onChange={(event) => setSelected(event.target.value)} disabled={busy}><option value="">{available.length ? "Choose a rider" : "No riders online right now"}</option>{available.map((rider) => <option value={rider.id} key={rider.id}>{rider.name} · {rider.phone}</option>)}</select></label>
        {selectedRider && needsDistance ? <><label className="rx-assignment-distance">One-way road distance (km)<input type="number" inputMode="decimal" min="0.001" max="1000" step="0.001" required value={oneWayDistance} disabled={busy} onChange={(event) => setOneWayDistance(event.target.value)} placeholder="For example, 5"/></label><small>Enter the road distance from this store to the customer. {policy.returnIncluded ? "The same distance is included for the return trip." : "Only the outward distance is included."} This is a seller-entered estimate; check the route before assigning.</small>{distanceQuote ? <div className="rx-assignment-quote"><b>Rider earns {riderMoney(distanceQuote.amountPaise)}</b><span>{riderKilometers(distanceQuote.billableMeters)} km total × {riderMoney(policy.ratePaisePerKm)}/km · Paid by {policy.payer === "partx" ? "PartX" : "your store"}</span><small>The rider sees this quote before accepting. This does not add a charge to the customer’s order.</small></div> : null}</> : null}
        {occupied.length ? <small>{occupied.map((rider) => rider.name).join(", ")} {occupied.length === 1 ? "is" : "are"} online but finishing an active delivery. An unfinished delivery must be completed or closed before a new pickup.</small> : null}{!available.length ? <small>Ask your rider to sign in to the PartX Rider portal and go online.</small> : null}<button type="submit" className="rx-primary" disabled={busy || !selectedRider || (needsDistance && !distanceQuote)}>{busy ? "Assigning…" : "Assign rider"}<Icon name="arrow"/></button>
      </form> : delivery?.state === "DELIVERED" ? <p>Delivered {deliveryDate(delivery.deliveredAt)}{delivery.codCollected ? ` · ₹${delivery.codAmount.toLocaleString("en-IN")} cash collected by rider. Settlement to store is pending reconciliation.` : ""}</p> : null}
    {action ? <form className="rx-reason-form" onSubmit={(event) => { event.preventDefault(); void run({ action, deliveryId: delivery!.id, reason }); }}><label>{action === "returned" ? "Confirm you physically received all returned parts. Add details:" : "Reason for cancelling this assignment"}<textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={500}/></label><div><button className="rx-secondary" type="button" onClick={() => setAction(null)}>Keep assignment</button><button className="rx-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Confirm"}</button></div></form> : null}
    {error || deliveryError ? <p className="rx-error" role="alert">{error || deliveryError}</p> : null}
  </section>;
}
