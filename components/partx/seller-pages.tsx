"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { SellerOrder, SellerOrderStatus } from "@/lib/types";
import { getDemoCatalog } from "@/lib/demo-data";
import { Icon } from "./icons";
import { useSeller } from "./seller-provider";

const packStatuses: SellerOrderStatus[] = ["New", "Accepted", "Packing"];
const nextStatus: Partial<Record<SellerOrderStatus, SellerOrderStatus>> = { New: "Accepted", Accepted: "Packing", Packing: "Packed", Packed: "Dispatched", Dispatched: "Delivered" };

export function SellerDashboardPage() {
  const { sellerOrders, tickets, ratings, productOverrides } = useSeller();
  const openTickets = tickets.filter((ticket) => ticket.status === "Open");
  const toPack = sellerOrders.filter((order) => packStatuses.includes(order.status));
  const lowStock = Object.entries(productOverrides).filter(([, item]) => item.stock < 5);
  return <>
    <SellerTitle title="Seller command center" subtitle="Overview of your store operations" />
    <div className="sx-stats">
      <Stat href="/seller/orders" icon="cart" label="New orders" value={sellerOrders.filter((order) => order.status === "New").length} action="View orders"/>
      <Stat href="/seller/packing" icon="box" label="To pack" value={toPack.length} action="Go to packing queue"/>
      <Stat href="/seller/tickets" icon="ticket" label="Open tickets" value={openTickets.length} action="View tickets"/>
      <Stat href="/seller/reviews" icon="star" label="Store rating" value="4.7 / 5" action="View reviews"/>
    </div>
    <div className="sx-dashboard-main">
      <section className="sx-panel sx-orders-panel"><PanelHead title="Orders to pack" href="/seller/orders" link="View all orders"/><SellerOrderTable orders={toPack}/></section>
      <section className="sx-panel sx-attention"><PanelHead title="Needs attention" href="/seller/tickets" link="View all tickets"/>{openTickets.slice(0, 1).map((ticket) => <article key={ticket.id}><div><b>{ticket.id}</b><span>{ticket.priority}</span></div><small>Order ID</small><strong>{ticket.orderId}</strong><small>Issue</small><h3>{ticket.issue}</h3><small>Customer</small><b>{ticket.customer.name}</b><p>{ticket.createdAt}</p><Link className="sx-primary" href={`/seller/tickets?ticket=${ticket.id}`}>Review ticket</Link></article>)}</section>
    </div>
    <div className="sx-lower-grid">
      <section className="sx-panel"><PanelHead title="Stock needs attention" href="/seller/products" link="View all products"/><div className="sx-stock-list">{lowStock.map(([partNumber, item]) => <div key={partNumber}><b>{getDemoCatalog().find((product) => product.partNumber === partNumber)?.name ?? partNumber}</b><span>{partNumber}</span><strong>{item.stock} units</strong><em>{item.stock === 0 ? "Out of stock" : "Low stock"}</em><Link href="/seller/products">Update stock</Link></div>)}</div></section>
      <section className="sx-panel sx-rating-summary"><PanelHead title="Verified ratings" href="/seller/reviews" link="View all reviews"/><div><strong>4.7<small>/ 5</small></strong><div className="sx-stars">★★★★★</div><span>Based on 128 verified reviews</span></div><div className="sx-rating-bars">{[72,19,6,2,1].map((width, index) => <div key={width}><b>{5-index} ★</b><i><span style={{width:`${width}%`}}/></i><em>{width}%</em></div>)}</div><small>{ratings.length} detailed demo reviews loaded</small></section>
    </div>
  </>;
}

export function SellerOrdersPage() {
  const { sellerOrders } = useSeller(); const [filter, setFilter] = useState("All");
  const shown = filter === "All" ? sellerOrders : sellerOrders.filter((order) => order.status === filter);
  return <><SellerTitle title="Seller orders" subtitle="Receive, prepare and complete every order assigned to your store"/><div className="sx-toolbar"><div className="sx-tabs">{["All","New","Packing","Packed","Dispatched","Delivered"].map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><label className="sx-search"><Icon name="search"/><input placeholder="Search order, tracking ID or customer"/></label></div><section className="sx-panel"><SellerOrderTable orders={shown} all/></section></>;
}

export function SellerPackingPage() {
  const { sellerOrders, updateOrderStatus } = useSeller();
  const queue = sellerOrders.filter((order) => ["New","Accepted","Packing","Packed"].includes(order.status));
  return <><SellerTitle title="Packing queue" subtitle="Pack the right part before each fulfilment deadline"/><div className="sx-packing-list">{queue.map((order, index) => <article key={order.id}><div className="sx-pack-number">{String(index + 1).padStart(2,"0")}</div><Image src={`/parts/${Math.min(index,5)}-v2.png`} alt="" width={180} height={130}/><div className="sx-pack-product"><span>{order.id}</span><h2>{order.productName}</h2><p>{order.partNumber} · Quantity {order.quantity}</p><small>Tracking {order.trackingId}</small></div><div className="sx-pack-meta"><span>Fulfilment<b>{labelFulfilment(order.fulfilment)}</b></span><span>Pack by<b className="urgent">{order.deadline}</b></span><span>Customer<b>{order.customer.name}</b></span></div><div className="sx-pack-actions"><Status status={order.status}/><Link href={`/seller/orders/${order.id}`}>Open order</Link>{nextStatus[order.status] ? <button className="sx-primary" onClick={() => updateOrderStatus(order.id,nextStatus[order.status]!)}>{actionFor(order.status)}</button> : null}</div></article>)}</div></>;
}

export function SellerOrderDetailPage({ id }: { id: string }) {
  const { sellerOrders, updateOrderStatus } = useSeller(); const order = sellerOrders.find((item) => item.id === id);
  if (!order) return <div className="sx-empty"><h1>Order not found</h1><Link href="/seller/orders">Return to orders</Link></div>;
  return <><Link className="sx-back" href="/seller/orders"><Icon name="back"/>All seller orders</Link><div className="sx-order-detail-head"><div><span>ORDER {order.id}</span><h1>{order.productName}</h1><p>Tracking ID {order.trackingId}</p></div><Status status={order.status}/></div><div className="sx-detail-grid"><section className="sx-panel"><PanelHead title="Packing information"/><div className="sx-product-focus"><Image src="/parts/0-v2.png" alt={order.productName} width={260} height={200}/><div><span>PART TO PACK</span><h2>{order.productName}</h2><p>Part number <b>{order.partNumber}</b></p><strong>Quantity {order.quantity}</strong></div></div><dl className="sx-detail-list"><div><dt>Pack deadline</dt><dd>{order.deadline}</dd></div><div><dt>Fulfilment</dt><dd>{labelFulfilment(order.fulfilment)}</dd></div><div><dt>Payment</dt><dd>{order.paymentStatus}</dd></div><div><dt>Order total</dt><dd>₹{order.total.toLocaleString("en-IN")}</dd></div></dl>{nextStatus[order.status] ? <button className="sx-primary sx-wide" onClick={() => updateOrderStatus(order.id,nextStatus[order.status]!)}>{actionFor(order.status)}</button> : null}</section><aside className="sx-panel"><PanelHead title="Customer & delivery"/><div className="sx-customer-card"><div className="sx-avatar">{initials(order.customer.name)}</div><div><b>{order.customer.name}</b><span>{order.customer.phone}</span><small>{maskEmail(order.customer.email)}</small></div></div><div className="sx-contact-actions"><a href={`tel:${order.customer.phone}`}><Icon name="phone"/>Call customer</a><button onClick={() => navigator.clipboard?.writeText(order.customer.phone)}><Icon name="copy"/>Copy number</button></div><p className="sx-privacy-note">Customer details are shown only for fulfilment and order support.</p><Link className="sx-secondary sx-wide" href={`/seller/tickets?order=${order.id}`}><Icon name="ticket"/>View related tickets</Link></aside></div></>;
}

export function SellerTicketsPage() {
  const { tickets, resolveTicket } = useSeller(); const [tab,setTab] = useState("Open"); const [selectedId,setSelectedId] = useState(tickets.find((ticket) => ticket.status === "Open")?.id ?? tickets[0]?.id); const [note,setNote] = useState(""); const [resolved,setResolved] = useState(false);
  const shown = tab === "All" ? tickets : tickets.filter((ticket) => ticket.status === tab);
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? shown[0];
  const close = () => { if (!selected) return; resolveTicket(selected.id,note); setResolved(true); };
  return <><SellerTitle title="Customer support tickets" subtitle="Manage and resolve customer issues"/><div className="sx-toolbar"><div className="sx-tabs">{["Open","Resolved","All"].map((item) => <button className={tab===item?"active":""} onClick={() => setTab(item)} key={item}>{item}<span>{item === "Open" ? tickets.filter((ticket)=>ticket.status==="Open").length : item === "Resolved" ? tickets.filter((ticket)=>ticket.status==="Resolved").length : tickets.length}</span></button>)}</div><label className="sx-search"><Icon name="search"/><input placeholder="Search ticket, order or customer"/></label></div><div className="sx-ticket-layout"><section className="sx-panel sx-ticket-list"><div className="sx-ticket-table-head"><span>Ticket ID</span><span>Order</span><span>Customer</span><span>Issue</span><span>Created</span><span>Priority</span><span>Status</span></div>{shown.map((ticket) => <button className={selected?.id===ticket.id?"active":""} onClick={() => {setSelectedId(ticket.id);setResolved(false);setNote(ticket.internalNote??"");}} key={ticket.id}><b>{ticket.id}</b><span>{ticket.orderId}</span><span>{ticket.customer.name}</span><span>{ticket.issue}</span><span>{ticket.createdAt}</span><em className={`priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</em><Status status={ticket.status}/></button>)}{!shown.length ? <div className="sx-empty-row">No {tab.toLowerCase()} tickets.</div> : null}</section>{selected ? <aside className="sx-panel sx-ticket-detail"><div className="sx-ticket-title"><div><h2>{selected.id}</h2><p>Order: {selected.orderId}</p></div><div><em className={`priority-${selected.priority.toLowerCase()}`}>{selected.priority}</em><Status status={selected.status}/></div></div><DetailBlock icon="user" label="Customer"><div className="sx-detail-customer"><div><b>{selected.customer.name}</b><span>{selected.customer.phone}</span><small>{maskEmail(selected.customer.email)}</small></div><div><a href={`tel:${selected.customer.phone}`}><Icon name="phone"/>Call customer</a><button onClick={()=>navigator.clipboard?.writeText(selected.customer.phone)}><Icon name="copy"/>Copy number</button></div></div></DetailBlock><DetailBlock icon="ticket" label="Issue"><b>{selected.issue}</b></DetailBlock><DetailBlock icon="orders" label="Customer message"><p>{selected.message}</p></DetailBlock><div className="sx-product-compare"><div><span>Ordered product</span><b>{selected.orderedProduct}</b></div><div><span>Delivered product</span><b>{selected.deliveredProduct ?? "Not provided"}</b></div></div><DetailBlock icon="box" label="Order info"><div className="sx-order-info"><span>Fulfilment<b>Delivery</b></span><span>Payment<b className="paid">Paid</b></span><span>Delivered<b>Today, 11:42 AM</b></span></div></DetailBlock><label className="sx-note">Seller internal note (optional)<textarea value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Add a note for internal reference…"/><small>Notes are only visible to your team.</small></label>{selected.status === "Open" ? <div className="sx-ticket-actions"><a href={`tel:${selected.customer.phone}`} className="sx-secondary"><Icon name="phone"/>Contact customer</a><button className="sx-primary" onClick={close}>Resolve & close ticket</button></div> : <div className="sx-resolved"><Icon name="check"/>Resolved {selected.resolvedAt}. Resolution saved to ticket history.</div>}{resolved ? <div className="sx-resolved"><Icon name="check"/>Ticket closed successfully and moved to Resolved.</div> : null}</aside> : null}</div></>;
}

export function SellerProductsPage() {
  const { productOverrides, updateProduct } = useSeller(); const products = getDemoCatalog();
  return <><SellerTitle title="Products & prices" subtitle="Manage what your store sells, its price and live stock"/><section className="sx-panel"><div className="sx-product-table"><div className="sx-product-table-head"><span>Product</span><span>Part number</span><span>Your price</span><span>Stock</span><span>Status</span><span>Action</span></div>{products.map((product) => <ProductEditor key={product.id} product={product} current={productOverrides[product.partNumber] ?? {price:product.price,stock:product.stock}} save={updateProduct}/>)}</div></section></>;
}

export function SellerReviewsPage() {
  const { ratings } = useSeller();
  return <><SellerTitle title="Verified customer ratings" subtitle="Ratings submitted only after successful delivery"/><div className="sx-reviews-layout"><section className="sx-panel sx-rating-hero"><strong>4.7<small>/ 5</small></strong><div className="sx-stars">★★★★★</div><p>128 verified store ratings</p><span>Displayed during customer store selection</span></section><section className="sx-review-list">{ratings.map((rating) => <article className="sx-panel" key={rating.id}><div><b>{rating.customerName}</b><span>{"★".repeat(rating.stars)}{"☆".repeat(5-rating.stars)}</span></div><p>{rating.comment}</p><small><Icon name="check"/>Verified purchase · {rating.orderId} · {rating.createdAt}</small></article>)}</section></div></>;
}

export function SellerSettingsPage() {
  const [saved,setSaved] = useState(false);
  return <><SellerTitle title="Store settings" subtitle="Manage seller identity, hours, fulfilment and notification preferences"/><form className="sx-panel sx-settings" onSubmit={(event)=>{event.preventDefault();setSaved(true);}}><div className="sx-form-grid"><label>Store name<input defaultValue="AutoHub Mumbai"/></label><label>Seller owner<input defaultValue="Rohan Mehta"/></label><label>Phone<input defaultValue="+91 98190 11022"/></label><label>GSTIN<input defaultValue="27ABCDE1234F1Z5"/></label><label>Business hours<input defaultValue="9:00 AM – 9:00 PM"/></label><label>Delivery radius<input defaultValue="8 km"/></label></div><label>Store address<textarea defaultValue="Goregaon East, Mumbai"/></label><label className="sx-check"><input type="checkbox" defaultChecked/>Receive new-order and urgent-ticket browser alerts</label><button className="sx-primary" type="submit">{saved?"Settings saved":"Save store settings"}</button><p>Firebase Authentication will later enforce the approved seller role and store ownership.</p></form></>;
}

function SellerOrderTable({ orders, all=false }: { orders: SellerOrder[]; all?: boolean }) {
  return <div className="sx-table-wrap"><div className="sx-order-table sx-order-head"><span>Order ID</span><span>Placed at</span><span>Customer</span><span>Product</span><span>Qty</span><span>Fulfilment</span><span>Payment</span><span>{all?"Status":"Deadline"}</span><span>Action</span></div>{orders.map((order) => <div className="sx-order-table" key={order.id}><b>{order.id}</b><span>{order.placedAt}</span><span><b>{order.customer.name}</b><small>{order.customer.phone}</small></span><span><b>{order.productName}</b><small>{order.partNumber}</small></span><span>{order.quantity}</span><span>{labelFulfilment(order.fulfilment)}</span><span className={`payment-${order.paymentStatus.toLowerCase()}`}>{order.paymentStatus}</span><span>{all?<Status status={order.status}/>:order.deadline}</span><Link className="sx-primary" href={`/seller/orders/${order.id}`}>Open order</Link></div>)}</div>;
}

function ProductEditor({ product,current,save }: { product: ReturnType<typeof getDemoCatalog>[number]; current:{price:number;stock:number}; save:(partNumber:string,price:number,stock:number)=>void }) {
  const [price,setPrice]=useState(current.price); const [stock,setStock]=useState(current.stock); const [saved,setSaved]=useState(false);
  return <div className="sx-product-row"><span><Image src={`/parts/${product.imageIndex}-v2.png`} alt="" width={74} height={58}/><b>{product.name}</b></span><span>{product.partNumber}</span><label>₹<input type="number" value={price} onChange={(event)=>setPrice(Number(event.target.value))}/></label><input type="number" value={stock} onChange={(event)=>setStock(Number(event.target.value))}/><Status status={stock===0?"Out of stock":stock<5?"Low stock":"Active"}/><button onClick={()=>{save(product.partNumber,price,stock);setSaved(true);}}>{saved?"Saved":"Save"}</button></div>;
}

function SellerTitle({ title,subtitle }: { title:string;subtitle:string }) { return <div className="sx-page-title"><h1>{title}</h1><p>{subtitle}</p></div>; }
function PanelHead({ title,href,link }: { title:string;href?:string;link?:string }) { return <div className="sx-panel-head"><h2>{title}<i/></h2>{href&&link?<Link href={href}>{link}<Icon name="arrow"/></Link>:null}</div>; }
function Stat({href,icon,label,value,action}:{href:string;icon:string;label:string;value:string|number;action:string}) { return <Link href={href}><Icon name={icon}/><span>{label}<i/></span><strong>{value}</strong><small>{action}<Icon name="arrow"/></small></Link>; }
function Status({status}:{status:string}) { return <em className={`sx-status status-${status.toLowerCase().replaceAll(" ","-")}`}>{status}</em>; }
function DetailBlock({icon,label,children}:{icon:string;label:string;children:React.ReactNode}) { return <section className="sx-detail-block"><span><Icon name={icon}/>{label}</span>{children}</section>; }
function labelFulfilment(value: SellerOrder["fulfilment"]) { return value === "delivery" ? "Delivery" : value === "pickup" ? "Pickup" : "Garage"; }
function actionFor(status: SellerOrderStatus) { return status === "New" ? "Accept order" : status === "Accepted" ? "Start packing" : status === "Packing" ? "Mark as packed" : status === "Packed" ? "Hand to courier" : status === "Dispatched" ? "Mark delivered" : "Completed"; }
function initials(name:string){return name.split(" ").map((part)=>part[0]).join("").slice(0,2).toUpperCase();}
function maskEmail(email:string){const [name,domain]=email.split("@");return `${name.slice(0,2)}***@${domain}`;}
