"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { demoApi } from "@/lib/api/client";
import { demoGarages, demoLocation, demoStores } from "@/lib/marketplace-data";
import type { AppLocation, CartLine, FulfilmentMode, Garage, Order, PartnerStore, PaymentMethod, Product, Vehicle } from "@/lib/types";
import { LocationPicker } from "./location-picker";

export type MarketplaceView = null | "location" | "garage" | "store" | "sellers" | "checkout";

type Props = {
  view: MarketplaceView;
  onViewChange: (view: MarketplaceView) => void;
  cart: CartLine[];
  subtotal: number;
  vehicle: Vehicle;
  comparisonProduct: Product | null;
  onAddFromStore: (product: Product) => void;
  onOrderComplete: (order: Order) => void;
};

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

function Arrow({ direction = "left" }: { direction?: "left" | "right" }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={direction === "left" ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"}/></svg>;
}

function FlowModal({ title, onBack, onClose, children, wide = false }: { title: string; onBack: () => void; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className={`modal marketplace-modal ${wide ? "marketplace-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header><button className="back-button" onClick={onBack}><Arrow/>Back</button><h2>{title}</h2><button className="modal-close" onClick={onClose} aria-label="Close">×</button></header>{children}</section></div>;
}

function Steps({ labels, active }: { labels: string[]; active: number }) {
  return <div className="flow-steps">{labels.map((label, index) => <div className={active >= index + 1 ? "active" : ""} key={label}><b>{active > index + 1 ? "✓" : index + 1}</b><span>{label}</span></div>)}</div>;
}

export function MarketplaceFeatures({ view, onViewChange, cart, subtotal, vehicle, comparisonProduct, onAddFromStore, onOrderComplete }: Props) {
  const [location, setLocation] = useState<AppLocation>(demoLocation);
  const [garages, setGarages] = useState<Garage[]>(demoGarages);
  const [stores, setStores] = useState<PartnerStore[]>(demoStores);
  const [fulfilment, setFulfilment] = useState<FulfilmentMode>("delivery");
  const pushedHistory = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("motopart-marketplace-v1");
    if (saved) {
      try {
        const data = JSON.parse(saved) as { location?: AppLocation; garages?: Garage[]; stores?: PartnerStore[] };
        Promise.resolve().then(() => {
          if (data.location) setLocation(data.location);
          if (data.garages?.length) setGarages(data.garages);
          if (data.stores?.length) setStores(data.stores);
        });
      } catch { /* Ignore invalid old demo data. */ }
    }
    Promise.all([demoApi.getStores(), demoApi.getGarages()]).then(([nextStores, nextGarages]) => {
      if (!saved) { setStores(nextStores); setGarages(nextGarages); }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("motopart-marketplace-v1", JSON.stringify({ location, garages, stores }));
  }, [location, garages, stores]);

  useEffect(() => {
    if (view && !pushedHistory.current) {
      window.history.pushState({ motopartView: view }, "");
      pushedHistory.current = true;
    }
  }, [view]);

  useEffect(() => {
    const handleBack = () => { pushedHistory.current = false; onViewChange(null); };
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, [onViewChange]);

  function closeView() {
    if (pushedHistory.current) window.history.back();
    else onViewChange(null);
  }

  function openView(next: MarketplaceView) {
    onViewChange(next);
  }

  async function addGarage(garage: Omit<Garage, "id" | "distanceKm">) {
    const created = await demoApi.addGarage(garage);
    setGarages((current) => [...current, created]);
    closeView();
  }

  async function addStore(store: Omit<PartnerStore, "id" | "rating" | "distanceKm">) {
    const created = await demoApi.addStore(store);
    setStores((current) => [...current, created]);
    closeView();
  }

  return <>
    <section className="marketplace-tools page-shell" aria-label="Marketplace preferences">
      <button className="market-tool" onClick={() => openView("location")}><span>Delivery location</span><b>{location.address.split(",").slice(0, 2).join(",")}</b><small>Change location →</small></button>
      <button className="market-tool" onClick={() => openView("garage")}><span>Saved garage</span><b>{garages[0]?.name ?? "Add your garage"}</b><small>{garages[0] ? `${garages[0].distanceKm} km · Change or add` : "Install parts at a garage"}</small></button>
      <div className="fulfilment-switch"><span>Fulfilment</span>{(["delivery", "pickup", "garage"] as FulfilmentMode[]).map((mode) => <button className={fulfilment === mode ? "active" : ""} key={mode} onClick={() => setFulfilment(mode)}>{mode === "delivery" ? "Deliver to me" : mode === "pickup" ? "Self pickup" : "To garage"}</button>)}</div>
      <button className="add-store-cta" onClick={() => openView("store")}><b>Sell on PartX</b><span>Add store +</span></button>
    </section>

    {view === "location" ? <LocationModal value={location} onChange={setLocation} onClose={closeView}/> : null}
    {view === "garage" ? <GarageModal initialLocation={location} onSave={addGarage} onClose={closeView}/> : null}
    {view === "store" ? <StoreModal initialLocation={location} products={cart.map((line) => line.product)} onSave={addStore} onClose={closeView}/> : null}
    {view === "sellers" && comparisonProduct ? <SellerModal product={comparisonProduct} stores={stores} fulfilment={fulfilment} onSelect={(product) => { onAddFromStore(product); closeView(); }} onClose={closeView}/> : null}
    {view === "checkout" ? <CheckoutModal cart={cart} subtotal={subtotal} location={location} garages={garages} stores={stores} vehicle={vehicle} initialFulfilment={fulfilment} onLocationChange={setLocation} onComplete={onOrderComplete} onClose={closeView}/> : null}
  </>;
}

function LocationModal({ value, onChange, onClose }: { value: AppLocation; onChange: (location: AppLocation) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value);
  return <FlowModal title="Update location" onBack={onClose} onClose={onClose}><div className="flow-body"><p className="flow-intro">Your location controls nearby store stock, pickup distance and delivery estimates.</p><LocationPicker value={draft} onSelect={setDraft} label="Search delivery location"/><button className="primary-button flow-primary" onClick={() => { onChange(draft); onClose(); }}>Save location <Arrow direction="right"/></button></div></FlowModal>;
}

function GarageModal({ initialLocation, onSave, onClose }: { initialLocation: AppLocation; onSave: (garage: Omit<Garage, "id" | "distanceKm">) => Promise<void>; onClose: () => void }) {
  const [location, setLocation] = useState({ ...initialLocation, label: "Garage" });
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget);
    await onSave({ name: String(form.get("name")), phone: String(form.get("phone")), services: String(form.get("services")), location });
  }
  return <FlowModal title="Add your garage" onBack={onClose} onClose={onClose}><form className="flow-body form-grid" onSubmit={submit}><p className="flow-intro full">Save a trusted garage and send parts directly there for installation.</p><label>Garage name<input name="name" required defaultValue="Singh Auto Care"/></label><label>Phone<input name="phone" required defaultValue="+91 98200 44551"/></label><label className="full">Services<input name="services" required defaultValue="Installation, diagnostics and general service"/></label><div className="full"><LocationPicker value={location} onSelect={setLocation} label="Find your garage on Google Maps"/></div><button className="primary-button flow-primary full" disabled={saving}>{saving ? "Saving garage…" : "Save garage"} <Arrow direction="right"/></button></form></FlowModal>;
}

function StoreModal({ initialLocation, products, onSave, onClose }: { initialLocation: AppLocation; products: Product[]; onSave: (store: Omit<PartnerStore, "id" | "rating" | "distanceKm">) => Promise<void>; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [location, setLocation] = useState({ ...initialLocation, label: "Store" });
  const [storeDetails, setStoreDetails] = useState({ name: "Shree Auto Spares", owner: "Akshay Singh", phone: "+91 98765 43210", gstin: "", businessHours: "9:00 AM – 9:00 PM", deliveryRadiusKm: 5 });
  const firstProduct = products[0];
  const [listing, setListing] = useState({ productId: firstProduct?.id ?? "bosch-brake-pads", productName: firstProduct?.name ?? "Front Disc Brake Pad Set", partNumber: firstProduct?.partNumber ?? "BP-0986-424-384", category: firstProduct?.category ?? "Brakes", price: 1299, mrp: 1620, stock: 20 });
  const [saving, setSaving] = useState(false);
  function back() { if (step > 1) setStep((current) => current - 1); else onClose(); }
  async function save() {
    setSaving(true);
    await onSave({ ...storeDetails, location, listings: [{ ...listing, id: `listing-${Date.now()}` }] });
  }
  return <FlowModal title="Add your store" onBack={back} onClose={onClose} wide><Steps labels={["Store details", "Location", "Products"]} active={step}/><div className="flow-body store-flow">
    {step === 1 ? <div className="form-grid"><label>Store name<input value={storeDetails.name} onChange={(e) => setStoreDetails({ ...storeDetails, name: e.target.value })}/></label><label>Owner name<input value={storeDetails.owner} onChange={(e) => setStoreDetails({ ...storeDetails, owner: e.target.value })}/></label><label>Phone<input value={storeDetails.phone} onChange={(e) => setStoreDetails({ ...storeDetails, phone: e.target.value })}/></label><label>GSTIN <small>Optional</small><input value={storeDetails.gstin} onChange={(e) => setStoreDetails({ ...storeDetails, gstin: e.target.value })}/></label><label>Business hours<input value={storeDetails.businessHours} onChange={(e) => setStoreDetails({ ...storeDetails, businessHours: e.target.value })}/></label><label>Delivery radius<select value={storeDetails.deliveryRadiusKm} onChange={(e) => setStoreDetails({ ...storeDetails, deliveryRadiusKm: Number(e.target.value) })}><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option></select></label></div> : null}
    {step === 2 ? <LocationPicker value={location} onSelect={setLocation} label="Find your store on Google Maps"/> : null}
    {step === 3 ? <div className="form-grid"><label>Product name<input value={listing.productName} onChange={(e) => setListing({ ...listing, productName: e.target.value })}/></label><label>Part number<input value={listing.partNumber} onChange={(e) => setListing({ ...listing, partNumber: e.target.value })}/></label><label>Category<input value={listing.category} onChange={(e) => setListing({ ...listing, category: e.target.value })}/></label><label>Selling price ₹<input type="number" value={listing.price} onChange={(e) => setListing({ ...listing, price: Number(e.target.value) })}/></label><label>MRP ₹<input type="number" value={listing.mrp} onChange={(e) => setListing({ ...listing, mrp: Number(e.target.value) })}/></label><label>Stock units<input type="number" value={listing.stock} onChange={(e) => setListing({ ...listing, stock: Number(e.target.value) })}/></label></div> : null}
    <div className="flow-actions"><button className="secondary-action" onClick={back}><Arrow/>Back</button>{step < 3 ? <button className="primary-button" onClick={() => setStep(step + 1)}>Continue <Arrow direction="right"/></button> : <button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? "Adding store…" : "Add store & product"}</button>}</div>
  </div></FlowModal>;
}

function SellerModal({ product, stores, fulfilment, onSelect, onClose }: { product: Product; stores: PartnerStore[]; fulfilment: FulfilmentMode; onSelect: (product: Product) => void; onClose: () => void }) {
  const offers = stores.flatMap((store) => store.listings.filter((listing) => listing.productId === product.id || listing.partNumber === product.partNumber).map((listing) => ({ store, listing }))).sort((a, b) => a.listing.price - b.listing.price);
  return <FlowModal title="Choose a store" onBack={onClose} onClose={onClose} wide><div className="seller-comparison"><header><div><b>{product.name}</b><span>{product.partNumber} · Fits your selected vehicle</span></div><strong>{offers.length} prices near you</strong></header>{offers.map(({ store, listing }, index) => <article className={index === 0 ? "best" : ""} key={listing.id}>{index === 0 ? <em>Best value</em> : null}<div><b>{store.name}</b><span>{store.location.address} · {store.distanceKm} km</span></div><strong>{money(listing.price)}<del>{money(listing.mrp)}</del></strong><div><b>★ {store.rating}</b><span>{listing.stock} in stock</span></div><div><b>{fulfilment === "pickup" ? "Pickup today" : fulfilment === "garage" ? "Delivery to garage" : "Delivery tomorrow"}</b><span>{fulfilment === "pickup" ? "Free" : "₹49"}</span></div><button onClick={() => onSelect({ ...product, seller: store.name, price: listing.price, listPrice: listing.mrp, stock: listing.stock })}>Choose & add</button></article>)}</div></FlowModal>;
}

function CheckoutModal({ cart, subtotal, location, garages, stores, vehicle, initialFulfilment, onLocationChange, onComplete, onClose }: { cart: CartLine[]; subtotal: number; location: AppLocation; garages: Garage[]; stores: PartnerStore[]; vehicle: Vehicle; initialFulfilment: FulfilmentMode; onLocationChange: (location: AppLocation) => void; onComplete: (order: Order) => void; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [fulfilment, setFulfilment] = useState(initialFulfilment);
  const [payment, setPayment] = useState<PaymentMethod>("upi");
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const deliveryFee = fulfilment === "pickup" ? 0 : 49;
  const total = subtotal + deliveryFee;
  function back() { if (step > 1 && step < 5) setStep((current) => current - 1); else onClose(); }
  async function pay() {
    setPaying(true); setError("");
    try {
      const result = await demoApi.processTestPayment({ amount: total, method: payment, cardNumber: card });
      if (result.status !== "approved") { setError(result.message); return; }
      const order = await demoApi.checkout({ address: fulfilment === "garage" ? garages[0]?.location.address ?? location.address : location.address, delivery: fulfilment, payment, productIds: cart.map((line) => line.product.id), storeId: stores[0]?.id });
      onComplete({ ...order, total });
      setStep(5);
    } finally { setPaying(false); }
  }
  return <FlowModal title={step === 5 ? "Order confirmed" : "Secure checkout"} onBack={back} onClose={onClose} wide><div className="checkout-experience">{step < 5 ? <Steps labels={["Address", "Fulfilment", "Payment", "Review"]} active={step}/> : null}
    {step === 1 ? <section><h3>Confirm your location</h3><LocationPicker value={location} onSelect={onLocationChange} label="Search delivery location"/><button className="primary-button flow-primary" onClick={() => setStep(2)}>Continue to fulfilment <Arrow direction="right"/></button></section> : null}
    {step === 2 ? <section><h3>How should we get the parts to you?</h3><div className="fulfilment-choices"><button className={fulfilment === "delivery" ? "selected" : ""} onClick={() => setFulfilment("delivery")}><b>Deliver to me</b><span>{location.address}</span><small>Tomorrow · ₹49</small></button><button className={fulfilment === "pickup" ? "selected" : ""} onClick={() => setFulfilment("pickup")}><b>Self pickup</b><span>{stores[0]?.name} · {stores[0]?.distanceKm} km</span><small>Today by 7 PM · Free</small></button><button className={fulfilment === "garage" ? "selected" : ""} onClick={() => setFulfilment("garage")}><b>Deliver to garage</b><span>{garages[0]?.name ?? "Add a garage first"}</span><small>Tomorrow · ₹49</small></button></div><div className="flow-actions"><button className="secondary-action" onClick={back}><Arrow/>Back</button><button className="primary-button" onClick={() => setStep(3)}>Continue to payment <Arrow direction="right"/></button></div></section> : null}
    {step === 3 ? <section><h3>Select a test payment method</h3><div className="test-payment-note"><b>TEST PAYMENT</b><span>No money will be charged</span></div><div className="payment-methods">{(["upi", "card", "cod"] as PaymentMethod[]).map((method) => <button className={payment === method ? "selected" : ""} key={method} onClick={() => setPayment(method)}>{method === "upi" ? "UPI" : method === "card" ? "Credit / debit card" : "Cash on delivery"}</button>)}</div>{payment === "card" ? <div className="card-fields"><label>Card number<input value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric"/></label><label>Expiry<input defaultValue="12 / 28"/></label><label>CVV<input defaultValue="123" inputMode="numeric"/></label><label>Name on card<input defaultValue="Akshay Singh"/></label></div> : null}{payment === "upi" ? <div className="upi-demo"><b>partx-test@okaxis</b><span>Use any demo UPI app. Approval is simulated.</span></div> : null}<div className="flow-actions"><button className="secondary-action" onClick={back}><Arrow/>Back</button><button className="primary-button" onClick={() => setStep(4)}>Review order <Arrow direction="right"/></button></div></section> : null}
    {step === 4 ? <section><h3>Review and place your order</h3><div className="review-layout"><div>{cart.map((line) => <div className="review-line" key={line.product.id}><span><b>{line.product.name}</b><small>{line.product.seller} · Qty {line.quantity}</small></span><strong>{money(line.product.price * line.quantity)}</strong></div>)}<div className="review-meta"><span>For {vehicle.year} {vehicle.make} {vehicle.model}</span><span>{fulfilment === "pickup" ? `Pickup from ${stores[0]?.name}` : fulfilment === "garage" ? `Deliver to ${garages[0]?.name}` : `Deliver to ${location.address}`}</span></div></div><aside><p><span>Subtotal</span><b>{money(subtotal)}</b></p><p><span>Delivery</span><b>{deliveryFee ? money(deliveryFee) : "Free"}</b></p><p className="review-total"><span>Total</span><b>{money(total)}</b></p></aside></div>{error ? <p className="payment-error">{error}</p> : null}<div className="flow-actions"><button className="secondary-action" onClick={back}><Arrow/>Back</button><button className="primary-button" disabled={paying} onClick={() => void pay()}>{paying ? "Processing test payment…" : `Pay ${money(total)} securely`}</button></div></section> : null}
    {step === 5 ? <section className="checkout-success"><span>✓</span><h3>Your order is confirmed.</h3><p>Test payment approved. No money was charged. Your parts are booked for {fulfilment === "pickup" ? "self pickup" : fulfilment === "garage" ? "garage delivery" : "home delivery"}.</p><button className="primary-button" onClick={onClose}>Track your order</button></section> : null}
  </div></FlowModal>;
}
