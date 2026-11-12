"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { sellerOrderHref } from "@/lib/navigation";
import { deliveryCall, deliveryDate, deliveryLabels, rideTrackingId, useAfterSales, useDelivery, type AfterSaleRequest } from "@/lib/rider";
import type { SellerOrder } from "@/lib/types";
import { usePartX, type PartXOrder } from "./app-provider";
import { DeliveryTracking } from "./delivery-tracking";
import { SellerDispatch } from "./seller-dispatch";

export function CustomerAfterSales({ order }: { order: PartXOrder }) {
  const { user } = usePartX();
  const { requests, error: loadError } = useAfterSales(order.id, order.stage === "Delivered" ? user?.id : undefined);
  const [selection, setSelection] = useState<{ index: number; kind: AfterSaleRequest["kind"] }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const deadline = (order.deliveredAtMs ?? 0) + 48 * 60 * 60_000;
  useEffect(() => {
    const tick = () => setNow(Date.now());
    queueMicrotask(tick);
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (order.stage !== "Delivered" || !order.items?.length) return null;
  const open = Boolean(now && order.deliveredAtMs && now < deadline);
  return <section className="px-panel px-after-sales">
    <h2>Returns and replacements</h2>
    {loadError && <p role="alert">{loadError}</p>}
    {order.items.map(({ product, quantity }, index) => {
      const request = requests.find((item) => item.itemIndex === index);
      const eligible = product.returnable || product.replaceable;
      return <article key={`${product.id}:${index}`} className="px-after-sale-item">
        <h3>{product.name} × {quantity}</h3>
        <p>{product.returnable ? "Returnable" : "Non-returnable"} · {product.replaceable ? "Replaceable" : "Non-replaceable"}</p>
        {request ? <>
          <p>{request.kind === "return" ? "Return" : "Replacement"} · {request.state === "REQUESTED" ? "Waiting for store assignment" : request.state === "ASSIGNED" ? "Rider assigned" : "Completed"}</p>
          {request.deliveryId && <DeliveryTracking key={request.deliveryId} deliveryId={request.deliveryId}/>}
        </> : eligible && <>
          <p>{open ? `Request by ${deliveryDate(deadline)}` : order.deliveredAtMs ? "The 48-hour request window has closed." : "Delivery time is unavailable. Contact order support."}</p>
          {open && <div className="px-after-sale-actions">
            {product.returnable && <button type="button" className="px-btn px-btn-outline" onClick={() => { setError(""); setSelection({ index, kind: "return" }); }}>Request return</button>}
            {product.replaceable && <button type="button" className="px-btn px-btn-outline" onClick={() => { setError(""); setSelection({ index, kind: "replacement" }); }}>Request replacement</button>}
          </div>}
        </>}
        {selection?.index === index && !request && <form className="px-form" onSubmit={(event) => {
          event.preventDefault();
          const reason = String(new FormData(event.currentTarget).get("reason"));
          setBusy(true); setError("");
          void deliveryCall("requestPartXAfterSale", { orderId: order.id, itemIndex: index, kind: selection.kind, reason })
            .then(() => setSelection(undefined)).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false));
        }}>
          <label>Reason for {selection.kind}<textarea name="reason" required minLength={5} maxLength={500}/></label>
          <div className="px-after-sale-actions">
            <button className="px-btn px-btn-red" disabled={busy || !open} type="submit">Send request</button>
            <button className="px-btn px-btn-outline" disabled={busy} type="button" onClick={() => setSelection(undefined)}>Cancel</button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>}
      </article>;
    })}
  </section>;
}

export function SellerAfterSales({ order }: { order: SellerOrder }) {
  const { user } = usePartX();
  const { requests, error } = useAfterSales(order.id, order.status === "Delivered" ? user?.id : undefined);
  if (!requests.length && !error) return null;
  return <section className="rx-dispatch"><h2>Returns and replacements</h2>
    {error && <p role="alert">{error}</p>}
    {requests.map((request) => <article className="px-after-sale-item" key={request.id}>
      <h3>{request.kind === "return" ? "Return" : "Replacement"} · {request.item.productName} × {request.item.quantity}</h3>
      <p>{request.reason}</p>
      <SellerDispatch key={request.deliveryId ?? request.id} order={order} request={request}/>
    </article>)}
  </section>;
}

export function SellerRideLookup() {
  const { user } = usePartX();
  const [tracking, setTracking] = useState("");
  const [rideId, setRideId] = useState<string>();
  const [validation, setValidation] = useState("");
  const { delivery, error } = useDelivery(rideId, user?.id);
  return <section className="rx-dispatch">
    <h2>Find a ride</h2>
    <form className="rx-assignment-form" onSubmit={(event) => {
      event.preventDefault();
      const match = tracking.trim().match(/^PX-RIDE-([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i);
      setRideId(match?.[1].toLowerCase());
      setValidation(match ? "" : "Enter a PartX ride tracking ID starting with PX-RIDE-.");
    }}>
      <label>Ride tracking ID<input value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="PX-RIDE-…" required maxLength={44}/></label>
      <button type="submit" className="rx-primary">Find ride</button>
    </form>
    {(validation || error) && <p role="alert">{validation || "No ride with that tracking ID is available to your store."}</p>}
    {delivery && delivery.id === rideId && <article className="px-after-sale-item">
      <h3>{delivery.kind === "return" ? "Return" : delivery.kind === "replacement" ? "Replacement" : "Delivery"} · {deliveryLabels[delivery.state]}</h3>
      <p>{rideTrackingId(delivery)}{delivery.pickupId && <><br/>Pickup ID {delivery.pickupId}</>}</p>
      <p>{delivery.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</p>
      <Link className="rx-link" href={sellerOrderHref(delivery.orderId)}>Open order {delivery.orderId}</Link>
    </article>}
  </section>;
}
