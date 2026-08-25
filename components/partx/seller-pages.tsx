"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { NewSellerProduct, SellerOrder, SellerOrderStatus, SellerProduct } from "@/lib/types";
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
  return <><SellerTitle title="Packing queue" subtitle="Pack the right part before each fulfilment deadline"/><div className="sx-packing-list">{queue.map((order, index) => <article key={order.id}><div className="sx-pack-number">{String(index + 1).padStart(2,"0")}</div><Image src={`/parts/${Math.min(index,5)}-v2.png`} alt="" width={180} height={130}/><div className="sx-pack-product"><span>{order.id}</span><h2>{order.productName}</h2><p>{order.partNumber} · Quantity {order.quantity}</p><small>Tracking {order.trackingId}</small></div><div className="sx-pack-meta"><span>Fulfilment<b>{labelFulfilment(order.fulfilment)}</b></span><span>Pack by<b className="urgent">{order.deadline}</b></span><span>Customer<b>{order.customer.name}</b></span></div><div className="sx-pack-actions"><Status status={order.status}/><Link href={`/seller/orders/${order.id}`}>Open order</Link>{nextStatus[order.status] ? <button className="sx-primary" onClick={() => void updateOrderStatus(order.id,nextStatus[order.status]!)}>{actionFor(order.status)}</button> : null}</div></article>)}{!queue.length ? <div className="sx-queue-empty"><Icon name="box"/><h2>No orders waiting to be packed</h2><p>New paid or cash-on-delivery orders assigned to this store will appear here in real time.</p></div> : null}</div></>;
}

export function SellerOrderDetailPage({ id }: { id: string }) {
  const { sellerOrders, updateOrderStatus } = useSeller(); const order = sellerOrders.find((item) => item.id === id);
  if (!order) return <div className="sx-empty"><h1>Order not found</h1><Link href="/seller/orders">Return to orders</Link></div>;
  return <><Link className="sx-back" href="/seller/orders"><Icon name="back"/>All seller orders</Link><div className="sx-order-detail-head"><div><span>ORDER {order.id}</span><h1>{order.productName}</h1><p>Tracking ID {order.trackingId} · Assigned to {order.storeName ?? "AutoHub Mumbai"}</p></div><Status status={order.status}/></div><div className="sx-detail-grid"><section className="sx-panel"><PanelHead title="Packing information"/><div className="sx-product-focus"><Image src="/parts/0-v2.png" alt={order.productName} width={260} height={200}/><div><span>PART TO PACK</span><h2>{order.productName}</h2><p>Part number <b>{order.partNumber}</b></p><strong>Quantity {order.quantity}</strong></div></div><dl className="sx-detail-list"><div><dt>Pack deadline</dt><dd>{order.deadline}</dd></div><div><dt>Fulfilment</dt><dd>{labelFulfilment(order.fulfilment)}</dd></div><div><dt>Payment</dt><dd className="sx-payment-detail">{paymentLabel(order)}{order.paymentReference ? <small>Ref: {order.paymentReference}</small> : null}</dd></div><div><dt>Order total</dt><dd>₹{order.total.toLocaleString("en-IN")}</dd></div></dl>{nextStatus[order.status] ? <button className="sx-primary sx-wide" onClick={() => void updateOrderStatus(order.id,nextStatus[order.status]!)}>{actionFor(order.status)}</button> : null}</section><aside className="sx-panel"><PanelHead title="Customer & delivery"/><div className="sx-customer-card"><div className="sx-avatar">{initials(order.customer.name)}</div><div><b>{order.customer.name}</b><span>{order.customer.phone}</span><small>{maskEmail(order.customer.email)}</small></div></div><div className="sx-contact-actions"><a href={`tel:${order.customer.phone}`}><Icon name="phone"/>Call customer</a><button onClick={() => navigator.clipboard?.writeText(order.customer.phone)}><Icon name="copy"/>Copy number</button></div><p className="sx-privacy-note">Customer details are shown only for fulfilment and order support.</p><Link className="sx-secondary sx-wide" href={`/seller/tickets?order=${order.id}`}><Icon name="ticket"/>View related tickets</Link></aside></div></>;
}

export function SellerTicketsPage() {
  const { tickets, resolveTicket } = useSeller(); const [tab,setTab] = useState("Open"); const [selectedId,setSelectedId] = useState(tickets.find((ticket) => ticket.status === "Open")?.id ?? tickets[0]?.id); const [note,setNote] = useState(""); const [resolved,setResolved] = useState(false);
  const shown = tab === "All" ? tickets : tickets.filter((ticket) => ticket.status === tab);
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? shown[0];
  const close = () => { if (!selected) return; resolveTicket(selected.id,note); setResolved(true); };
  return <><SellerTitle title="Customer support tickets" subtitle="Manage and resolve customer issues"/><div className="sx-toolbar"><div className="sx-tabs">{["Open","Resolved","All"].map((item) => <button className={tab===item?"active":""} onClick={() => setTab(item)} key={item}>{item}<span>{item === "Open" ? tickets.filter((ticket)=>ticket.status==="Open").length : item === "Resolved" ? tickets.filter((ticket)=>ticket.status==="Resolved").length : tickets.length}</span></button>)}</div><label className="sx-search"><Icon name="search"/><input placeholder="Search ticket, order or customer"/></label></div><div className="sx-ticket-layout"><section className="sx-panel sx-ticket-list"><div className="sx-ticket-table-head"><span>Ticket ID</span><span>Order</span><span>Customer</span><span>Issue</span><span>Created</span><span>Priority</span><span>Status</span></div>{shown.map((ticket) => <button className={selected?.id===ticket.id?"active":""} onClick={() => {setSelectedId(ticket.id);setResolved(false);setNote(ticket.internalNote??"");}} key={ticket.id}><b>{ticket.id}</b><span>{ticket.orderId}</span><span>{ticket.customer.name}</span><span>{ticket.issue}</span><span>{ticket.createdAt}</span><em className={`priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</em><Status status={ticket.status}/></button>)}{!shown.length ? <div className="sx-empty-row">No {tab.toLowerCase()} tickets.</div> : null}</section>{selected ? <aside className="sx-panel sx-ticket-detail"><div className="sx-ticket-title"><div><h2>{selected.id}</h2><p>Order: {selected.orderId}</p></div><div><em className={`priority-${selected.priority.toLowerCase()}`}>{selected.priority}</em><Status status={selected.status}/></div></div><DetailBlock icon="user" label="Customer"><div className="sx-detail-customer"><div><b>{selected.customer.name}</b><span>{selected.customer.phone}</span><small>{maskEmail(selected.customer.email)}</small></div><div><a href={`tel:${selected.customer.phone}`}><Icon name="phone"/>Call customer</a><button onClick={()=>navigator.clipboard?.writeText(selected.customer.phone)}><Icon name="copy"/>Copy number</button></div></div></DetailBlock><DetailBlock icon="ticket" label="Issue"><b>{selected.issue}</b></DetailBlock><DetailBlock icon="orders" label="Customer message"><p>{selected.message}</p></DetailBlock><div className="sx-product-compare"><div><span>Ordered product</span><b>{selected.orderedProduct}</b></div><div><span>Delivered product</span><b>{selected.deliveredProduct ?? "Not provided"}</b></div></div><DetailBlock icon="box" label="Order info"><div className="sx-order-info"><span>Fulfilment<b>Delivery</b></span><span>Payment<b className="paid">Paid</b></span><span>Delivered<b>Today, 11:42 AM</b></span></div></DetailBlock><label className="sx-note">Seller internal note (optional)<textarea value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Add a note for internal reference…"/><small>Notes are only visible to your team.</small></label>{selected.status === "Open" ? <div className="sx-ticket-actions"><a href={`tel:${selected.customer.phone}`} className="sx-secondary"><Icon name="phone"/>Contact customer</a><button className="sx-primary" onClick={close}>Resolve & close ticket</button></div> : <div className="sx-resolved"><Icon name="check"/>Resolved {selected.resolvedAt}. Resolution saved to ticket history.</div>}{resolved ? <div className="sx-resolved"><Icon name="check"/>Ticket closed successfully and moved to Resolved.</div> : null}</aside> : null}</div></>;
}

export function SellerProductsPage() {
  const { productOverrides, updateProduct, sellerProducts, addProduct, addProducts, updateSellerProduct, uploadProductImage } = useSeller();
  const products = getDemoCatalog();
  const [adding, setAdding] = useState(false);
  const [spreadsheet, setSpreadsheet] = useState<ProductSpreadsheet | null>(null);
  const [readingSpreadsheet, setReadingSpreadsheet] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseSpreadsheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReadingSpreadsheet(true); setMessage("");
    try { setSpreadsheet(await readProductSpreadsheet(file, sellerProducts)); }
    catch (reason) { setSpreadsheet({ fileName: file.name, products: [], errors: [reason instanceof Error ? reason.message : "The workbook could not be read."] }); }
    finally { setReadingSpreadsheet(false); }
  };
  return <>
    <div className="sx-product-page-head">
      <SellerTitle title="Products & prices" subtitle="Manage what your store sells, its price and live stock"/>
      <div className="sx-product-head-actions">
        <a className="sx-secondary" href="/templates/PartX_Product_Upload_Template.xlsx" download><Icon name="download"/>Download Excel template</a>
        <button className="sx-secondary" disabled={readingSpreadsheet} onClick={() => fileInput.current?.click()}><Icon name="upload"/>{readingSpreadsheet?"Reading Excel…":"Upload Excel"}</button>
        <button className="sx-primary" onClick={() => setAdding(true)}><Icon name="plus"/>Add product</button>
        <input ref={fileInput} className="sx-hidden-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void chooseSpreadsheet(event)}/>
      </div>
    </div>
    {message ? <div className="sx-product-success" role="status"><Icon name="check"/>{message}</div> : null}
    <section className="sx-panel">
      <PanelHead title={`Your Firebase products (${sellerProducts.length})`}/>
      {sellerProducts.length ? <div className="sx-product-table"><div className="sx-product-table-head"><span>Product</span><span>Part number</span><span>Your price</span><span>Stock</span><span>Status</span><span>Action</span></div>{sellerProducts.map((product) => <SellerProductEditor key={product.id} product={product} save={updateSellerProduct} uploadImage={uploadProductImage}/>)}</div> : <div className="sx-product-empty"><span><Icon name="box"/></span><h2>No products added yet</h2><p>Add your first part with its price, stock and vehicle compatibility.</p><button className="sx-primary" onClick={() => setAdding(true)}>Add your first product</button></div>}
    </section>
    <section className="sx-panel sx-demo-products">
      <PanelHead title="Demo catalogue pricing"/>
      <div className="sx-product-table"><div className="sx-product-table-head"><span>Product</span><span>Part number</span><span>Your price</span><span>Stock</span><span>Status</span><span>Action</span></div>{products.map((product) => <ProductEditor key={product.id} product={product} current={productOverrides[product.partNumber] ?? {price:product.price,stock:product.stock}} save={updateProduct}/>)}</div>
    </section>
    {adding ? <AddProductDialog existingProducts={sellerProducts} close={() => setAdding(false)} submit={async (product, image) => { await addProduct(product, image); setAdding(false); setMessage(`${product.name} was published${image ? " with its product image" : ""} to your store.`); }}/> : null}
    {spreadsheet ? <SpreadsheetImportDialog spreadsheet={spreadsheet} close={() => setSpreadsheet(null)} submit={async () => { await addProducts(spreadsheet.products); setSpreadsheet(null); setMessage(`${spreadsheet.products.length} products were imported into your Firebase inventory.`); }}/> : null}
  </>;
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
  return <div className="sx-table-wrap"><div className="sx-order-table sx-order-head"><span>Order ID</span><span>Placed at</span><span>Customer</span><span>Product</span><span>Qty</span><span>Fulfilment</span><span>Payment</span><span>{all?"Status":"Deadline"}</span><span>Action</span></div>{orders.map((order) => <div className="sx-order-table" key={order.id}><b>{order.id}</b><span>{order.placedAt}</span><span><b>{order.customer.name}</b><small>{order.customer.phone}</small></span><span><b>{order.productName}</b><small>{order.partNumber} · {order.storeName ?? "AutoHub Mumbai"}</small></span><span>{order.quantity}</span><span className={`payment-${order.paymentStatus.toLowerCase()}`}>{paymentLabel(order)}{order.paymentReference ? <small>{order.paymentReference}</small> : null}</span><span>{all?<Status status={order.status}/>:order.deadline}</span><Link className="sx-primary" href={`/seller/orders/${order.id}`}>Open order</Link></div>)}{!orders.length ? <div className="sx-empty-row">No real orders have been assigned to this store yet.</div> : null}</div>;
}

function paymentLabel(order: SellerOrder) {
  if (order.paymentStatus === "COD") return "Collect on delivery";
  if (order.paymentStatus === "Pending") return "Payment pending";
  return order.paymentMode === "live" ? "Payment verified" : "Test payment";
}

function ProductEditor({ product,current,save }: { product: ReturnType<typeof getDemoCatalog>[number]; current:{price:number;stock:number}; save:(partNumber:string,price:number,stock:number)=>void }) {
  const [price,setPrice]=useState(current.price); const [stock,setStock]=useState(current.stock); const [saved,setSaved]=useState(false);
  return <div className="sx-product-row"><span><Image src={`/parts/${product.imageIndex}-v2.png`} alt="" width={74} height={58}/><b>{product.name}</b></span><span>{product.partNumber}</span><label>₹<input type="number" value={price} onChange={(event)=>setPrice(Number(event.target.value))}/></label><input type="number" value={stock} onChange={(event)=>setStock(Number(event.target.value))}/><Status status={stock===0?"Out of stock":stock<5?"Low stock":"Active"}/><button onClick={()=>{save(product.partNumber,price,stock);setSaved(true);}}>{saved?"Saved":"Save"}</button></div>;
}

function SellerProductEditor({ product, save, uploadImage }: { product: SellerProduct; save: (productId: string, sellingPrice: number, stock: number) => Promise<void>; uploadImage: (productId: string, image: File) => Promise<void> }) {
  const [price, setPrice] = useState(product.sellingPrice);
  const [stock, setStock] = useState(product.stock);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const submit = async () => {
    setSaving(true); setSaved(false);
    try { await save(product.id, price, stock); setSaved(true); } finally { setSaving(false); }
  };
  const chooseImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0]; event.target.value = "";
    if (!image) return;
    setUploadingImage(true); setImageError("");
    try { await uploadImage(product.id, image); }
    catch (reason) { setImageError(reason instanceof Error ? reason.message : "Image upload failed."); }
    finally { setUploadingImage(false); }
  };
  return <div className="sx-product-row"><span>{product.imageUrl ? <Image src={product.imageUrl} alt={product.name} width={74} height={58}/> : <span className="sx-product-placeholder"><Icon name="box"/></span>}<b>{product.name}<small>{product.brand} · {product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</small><label className="sx-product-image-upload"><Icon name="upload"/>{uploadingImage?"Uploading…":product.imageUrl?"Change image":"Add image"}<input className="sx-hidden-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingImage} onChange={(event) => void chooseImage(event)}/></label>{imageError ? <small className="sx-image-error">{imageError}</small> : null}</b></span><span>{product.partNumber}</span><label>₹<input type="number" min="0" value={price} onChange={(event) => setPrice(Number(event.target.value))}/></label><input type="number" min="0" value={stock} onChange={(event) => setStock(Number(event.target.value))}/><Status status={stock===0?"Out of stock":stock<5?"Low stock":"Active"}/><button disabled={saving} onClick={() => void submit()}>{saving?"Saving…":saved?"Saved":"Save"}</button></div>;
}

type ProductSpreadsheet = { fileName: string; products: NewSellerProduct[]; errors: string[] };

async function readProductSpreadsheet(file: File, existingProducts: SellerProduct[]): Promise<ProductSpreadsheet> {
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file, "Products");
  const expectedHeaders = ["Product Name", "Brand", "Category", "Part Number", "SKU", "Barcode", "Condition", "MRP", "Selling Price", "GST Rate", "Stock", "Warranty", "Vehicle Compatibility", "Description"];
  const headerIndex = rows.findIndex((row) => expectedHeaders.every((header, index) => String(row[index] ?? "").trim() === header));
  if (headerIndex < 0) throw new Error("The Products sheet or PartX column headings are missing. Download a fresh template and try again.");
  const errors: string[] = [];
  const products: NewSellerProduct[] = [];
  const knownSkus = new Set(existingProducts.map((product) => product.sku.trim().toLowerCase()));
  const importedSkus = new Set<string>();
  const categories = new Set(["Filters", "Brakes", "Batteries", "Engine", "Electrical", "Suspension", "Accessories", "Other"]);
  const conditions = new Set(["New", "Refurbished", "Used"]);
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const excelRow = headerIndex + offset + 2;
    if (row.every((cell) => cell === null || String(cell).trim() === "")) return;
    const text = (index: number) => String(row[index] ?? "").trim();
    const sku = text(4).toUpperCase();
    if (sku.startsWith("SAMPLE-")) return;
    const product: NewSellerProduct = {
      name: text(0), brand: text(1), category: text(2), partNumber: text(3).toUpperCase(), sku,
      barcode: text(5) || undefined, condition: text(6) as NewSellerProduct["condition"], mrp: Number(row[7]), sellingPrice: Number(row[8]),
      gstRate: Number(row[9]), stock: Number(row[10]), warranty: text(11), compatibility: text(12), description: text(13),
    };
    const missing = expectedHeaders.filter((_, index) => ![5, 9].includes(index) && (row[index] === null || String(row[index]).trim() === ""));
    const rowErrors: string[] = [];
    if (missing.length) rowErrors.push(`missing ${missing.join(", ")}`);
    if (!categories.has(product.category)) rowErrors.push("invalid category");
    if (!conditions.has(product.condition)) rowErrors.push("invalid condition");
    if (![0, 5, 12, 18, 28].includes(product.gstRate)) rowErrors.push("invalid GST rate");
    if (!Number.isFinite(product.mrp) || product.mrp < 0) rowErrors.push("invalid MRP");
    if (!Number.isFinite(product.sellingPrice) || product.sellingPrice < 0) rowErrors.push("invalid selling price");
    if (product.sellingPrice > product.mrp) rowErrors.push("selling price is higher than MRP");
    if (!Number.isInteger(product.stock) || product.stock < 0) rowErrors.push("stock must be a whole number");
    if (knownSkus.has(sku.toLowerCase())) rowErrors.push("SKU already exists in your store");
    if (importedSkus.has(sku.toLowerCase())) rowErrors.push("duplicate SKU in this workbook");
    if (rowErrors.length) { errors.push(`Row ${excelRow}: ${rowErrors.join("; ")}.`); return; }
    importedSkus.add(sku.toLowerCase());
    products.push(product);
  });
  if (!products.length && !errors.length) errors.push("No products were found. Delete the sample row and add at least one real product.");
  return { fileName: file.name, products, errors };
}

function SpreadsheetImportDialog({ spreadsheet, close, submit }: { spreadsheet: ProductSpreadsheet; close: () => void; submit: () => Promise<void> }) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const runImport = async () => {
    setImporting(true); setError("");
    try { await submit(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Products could not be imported."); setImporting(false); }
  };
  return <div className="sx-dialog-backdrop" role="presentation"><div className="sx-product-dialog sx-import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-products-title"><header><div><span>EXCEL BULK UPLOAD</span><h2 id="import-products-title">Review product import</h2><p>{spreadsheet.fileName}</p></div><button type="button" onClick={close} aria-label="Close Excel import"><Icon name="close"/></button></header><div className="sx-import-body"><div className="sx-import-summary"><div><strong>{spreadsheet.products.length}</strong><span>Ready to import</span></div><div className={spreadsheet.errors.length ? "has-errors" : ""}><strong>{spreadsheet.errors.length}</strong><span>Rows needing attention</span></div><div><Icon name="box"/><span>Images can be added later from product editing.</span></div></div>{spreadsheet.products.length ? <div className="sx-import-preview"><div><b>Product</b><b>SKU</b><b>Price</b><b>Stock</b></div>{spreadsheet.products.slice(0,8).map((product) => <div key={product.sku}><span>{product.name}<small>{product.brand} · {product.category}</small></span><span>{product.sku}</span><span>₹{product.sellingPrice.toLocaleString("en-IN")}</span><span>{product.stock}</span></div>)}{spreadsheet.products.length > 8 ? <p>+ {spreadsheet.products.length - 8} more valid products</p> : null}</div> : null}{spreadsheet.errors.length ? <section className="sx-import-errors"><h3>Fix these rows</h3>{spreadsheet.errors.map((message) => <p key={message}>{message}</p>)}</section> : null}{error ? <p className="sx-form-error" role="alert">{error}</p> : null}</div><footer><button type="button" className="sx-secondary" onClick={close}>Cancel</button><button type="button" className="sx-primary" disabled={importing || !spreadsheet.products.length} onClick={() => void runImport()}>{importing?"Importing…":`Import ${spreadsheet.products.length} products`}</button></footer></div></div>;
}

function AddProductDialog({ existingProducts, close, submit }: { existingProducts: SellerProduct[]; close: () => void; submit: (product: NewSellerProduct, image?: File) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    const product: NewSellerProduct = {
      name: String(data.get("name") ?? "").trim(),
      brand: String(data.get("brand") ?? "").trim(),
      category: String(data.get("category") ?? "").trim(),
      partNumber: String(data.get("partNumber") ?? "").trim().toUpperCase(),
      sku: String(data.get("sku") ?? "").trim().toUpperCase(),
      barcode: String(data.get("barcode") ?? "").trim() || undefined,
      condition: String(data.get("condition")) as NewSellerProduct["condition"],
      mrp: Number(data.get("mrp")),
      sellingPrice: Number(data.get("sellingPrice")),
      gstRate: Number(data.get("gstRate")),
      stock: Number(data.get("stock")),
      warranty: String(data.get("warranty") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      compatibility: String(data.get("compatibility") ?? "").trim(),
    };
    if (product.sellingPrice > product.mrp) { setError("Selling price cannot be higher than MRP."); return; }
    if (existingProducts.some((item) => item.sku.toLowerCase() === product.sku.toLowerCase())) { setError("This SKU already exists in your store."); return; }
    setSaving(true);
    const image = data.get("image");
    try { await submit(product, image instanceof File && image.size ? image : undefined); } catch (reason) { setError(reason instanceof Error ? reason.message : "Product could not be saved. Check Firebase access and try again."); setSaving(false); }
  };
  return <div className="sx-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="sx-product-dialog" role="dialog" aria-modal="true" aria-labelledby="add-product-title"><header><div><span>SELLER INVENTORY</span><h2 id="add-product-title">Add a product</h2><p>Publish a part with its image, price, stock and fitment details.</p></div><button type="button" onClick={close} aria-label="Close add product form"><Icon name="close"/></button></header><form onSubmit={save}><label className="sx-product-image-field">Product image <span>JPG, PNG or WebP · maximum 5 MB</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp"/></label><div className="sx-product-form-grid"><label>Product name<input name="name" required placeholder="e.g. BMW Air Filter"/></label><label>Brand<input name="brand" required placeholder="e.g. Bosch"/></label><label>Category<select name="category" required defaultValue=""><option value="" disabled>Select category</option><option>Filters</option><option>Brakes</option><option>Batteries</option><option>Engine</option><option>Electrical</option><option>Suspension</option><option>Accessories</option><option>Other</option></select></label><label>Condition<select name="condition" defaultValue="New"><option>New</option><option>Refurbished</option><option>Used</option></select></label><label>Manufacturer part number<input name="partNumber" required placeholder="e.g. F026400492"/></label><label>Your SKU<input name="sku" required placeholder="e.g. ARR-BMW-AF-001"/></label><label>Barcode / EAN / UPC (optional)<input name="barcode" inputMode="numeric" placeholder="Scan or enter the code"/></label><label>MRP (₹)<input name="mrp" type="number" min="0" required/></label><label>Selling price (₹)<input name="sellingPrice" type="number" min="0" required/></label><label>GST rate<select name="gstRate" defaultValue="18"><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></label><label>Available stock<input name="stock" type="number" min="0" required/></label><label>Warranty<input name="warranty" required placeholder="e.g. 6 months"/></label><label>Vehicle compatibility<input name="compatibility" required placeholder="e.g. BMW X1 2020–2024 Diesel"/></label></div><label className="sx-product-description">Description<textarea name="description" required placeholder="Part specifications, fitment notes and box contents"/></label>{error ? <p className="sx-form-error" role="alert">{error}</p> : null}<footer><button type="button" className="sx-secondary" onClick={close}>Cancel</button><button type="submit" className="sx-primary" disabled={saving}>{saving?"Publishing…":"Publish product"}</button></footer></form></div></div>;
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
