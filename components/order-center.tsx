"use client";

import { FormEvent, useState } from "react";
import { demoApi } from "@/lib/api/client";
import type { Order, SupportIssueType, SupportTicket } from "@/lib/types";

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

function BackIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg>;
}

export function OrderCenter({ orders, onClose, onTrack }: { orders: Order[]; onClose: () => void; onTrack: (order: Order) => void }) {
  const [supportOrder, setSupportOrder] = useState<Order | null>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function back() {
    if (supportOrder) { setSupportOrder(null); setTicket(null); }
    else onClose();
  }

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supportOrder) return;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const created = await demoApi.createSupportTicket({ orderId: supportOrder.id, issueType: String(form.get("issueType")) as SupportIssueType, message: String(form.get("message")) });
      setTicket(created);
    } finally { setSubmitting(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal orders-modal" role="dialog" aria-modal="true" aria-label={supportOrder ? "Contact order support" : "My orders"} onMouseDown={(event) => event.stopPropagation()}><header><button className="back-button orders-back" onClick={back}><BackIcon/>Back</button><h2>{supportOrder ? "Contact us" : "My orders"}</h2><button className="modal-close" onClick={onClose} aria-label="Close">×</button></header>
    {supportOrder ? <div className="support-panel">{ticket ? <div className="ticket-success"><span>✓</span><h3>We’ve received your request.</h3><p>Ticket <b>#{ticket.id}</b> was opened for order <b>#{ticket.orderId}</b>. Our support team will contact you on your registered phone or email.</p><button className="primary-button" onClick={() => { setSupportOrder(null); setTicket(null); }}>Back to my orders</button></div> : <form onSubmit={submitIssue}><div className="support-order-summary"><span>Order #{supportOrder.id}</span><b>{supportOrder.stage}</b><small>{money(supportOrder.total)} · ETA {supportOrder.eta}</small></div><label>What can we help with?<select name="issueType" defaultValue="delivery"><option value="delivery">Delivery delay or tracking</option><option value="wrong-part">Wrong or damaged part</option><option value="fitment">Fitment or compatibility issue</option><option value="payment">Payment or refund</option><option value="return">Return or replacement</option><option value="other">Something else</option></select></label><label>Tell us what happened<textarea name="message" required minLength={10} placeholder="Include the part name and any details that will help us resolve this quickly."/></label><div className="support-contact-note"><b>Response time</b><span>Usually within 2 business hours · Demo support ticket</span></div><button className="primary-button" disabled={submitting}>{submitting ? "Creating ticket…" : "Submit support request"}</button></form>}</div> : <div className="orders-list">{orders.length ? orders.map((order) => <article key={order.id}><div className="order-list-head"><span><b>Order #{order.id}</b><small>Placed {order.placedAt}</small></span><em className={`order-status status-${order.stage.toLowerCase().replaceAll(" ", "-")}`}>{order.stage}</em></div><dl><div><dt>Total</dt><dd>{money(order.total)}</dd></div><div><dt>Expected</dt><dd>{order.eta}</dd></div></dl><div className="order-progress"><span style={{ width: `${(["Confirmed", "Preparing", "Picked up", "On the way", "Delivered"].indexOf(order.stage) + 1) * 20}%` }}/></div><div className="order-actions"><button className="secondary-action" onClick={() => setSupportOrder(order)}>Get help with this order</button><button className="order-track-button" onClick={() => onTrack(order)}>Track order</button></div></article>) : <div className="orders-empty"><h3>No orders yet</h3><p>Your placed orders will appear here.</p></div>}</div>}
  </section></div>;
}
