"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import type { FulfilmentMode, Garage, PartnerStore, PaymentMethod, Vehicle } from "@/lib/types";
import { QRCodeSVG } from "qrcode.react";
import { createAndroidUpiIntent, createIosUpiLink, createUpiUri, isValidUpiId, isValidUtr } from "@/lib/upi-payments";
import { usePartX, type PartXOrder } from "./app-provider";
import { Icon } from "./icons";
import { useSeller } from "./seller-provider";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";

export function GaragePage() {
  const { vehicles, activeVehicleId, setActiveVehicleId, addVehicle, location, setLocation, garages, addGarage } = usePartX();
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [garageOpen, setGarageOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const saveVehicle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const vehicle: Vehicle = { id: `vehicle-${Date.now()}`, year: Number(data.get("year")), make: String(data.get("make")), model: String(data.get("model")), variant: String(data.get("variant")), fuel: String(data.get("fuel")), transmission: String(data.get("transmission")), registration: String(data.get("registration")) };
    addVehicle(vehicle); setVehicleOpen(false);
  };
  const saveGarage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const garage: Garage = { id: `garage-${Date.now()}`, name: String(data.get("name")), phone: String(data.get("phone")), services: String(data.get("services")), distanceKm: 2.5, location: { id: `garage-location-${Date.now()}`, label: "Garage", address: String(data.get("address")) } };
    addGarage(garage); setGarageOpen(false);
  };
  return <div className="px-page px-container">
    <div className="px-page-heading-row"><div className="px-page-title"><span>FITMENT PROFILE</span><h1>My garage</h1><p>Save vehicles, installers, and delivery locations for faster, more accurate shopping.</p></div><button className="px-btn px-btn-red" onClick={() => setVehicleOpen(true)}><Icon name="plus"/>Add vehicle</button></div>
    <div className="px-dashboard-grid">
      <section className="px-panel px-panel-wide"><div className="px-panel-head"><div><span>MY VEHICLES</span><h2>Select your active vehicle</h2></div></div><div className="px-vehicle-list">{vehicles.map((vehicle) => <button className={activeVehicleId === vehicle.id ? "active" : ""} onClick={() => setActiveVehicleId(vehicle.id)} key={vehicle.id}><Image src="/vehicle-suv.png" alt="" width={220} height={120}/><div><b>{vehicle.year} {vehicle.make} {vehicle.model}</b><span>{vehicle.variant} · {vehicle.fuel} · {vehicle.transmission}</span><small>{vehicle.registration}</small></div>{activeVehicleId === vehicle.id && <em><Icon name="check"/>Active</em>}</button>)}</div></section>
      <section className="px-panel"><div className="px-panel-head"><div><span>DELIVERY LOCATION</span><h2>{location.label}</h2></div><button onClick={() => setLocationOpen(true)}>Edit</button></div><p className="px-address"><Icon name="pin"/>{location.address}</p></section>
      <section className="px-panel"><div className="px-panel-head"><div><span>TRUSTED GARAGES</span><h2>{garages.length} saved</h2></div><button onClick={() => setGarageOpen(true)}>Add</button></div>{garages.map((garage) => <div className="px-garage-row" key={garage.id}><div className="px-square-icon"><Icon name="garage"/></div><div><b>{garage.name}</b><span>{garage.services}</span><small>{garage.location.address}</small></div></div>)}</section>
    </div>
    {vehicleOpen && <Modal title="Add a vehicle" close={() => setVehicleOpen(false)}><form className="px-form" onSubmit={saveVehicle}><div className="px-form-grid"><label>Year<input name="year" type="number" defaultValue="2022" required/></label><label>Make<input name="make" defaultValue="MG" required/></label><label>Model<input name="model" defaultValue="Hector" required/></label><label>Variant<input name="variant" defaultValue="Sharp 1.5" required/></label><label>Fuel<select name="fuel"><option>Petrol</option><option>Diesel</option><option>Electric</option></select></label><label>Transmission<select name="transmission"><option>Manual</option><option>Automatic</option><option>CVT</option></select></label></div><label>Registration<input name="registration" placeholder="MH 02 AB 1234"/></label><button className="px-btn px-btn-red" type="submit">Save vehicle</button></form></Modal>}
    {garageOpen && <Modal title="Add a trusted garage" close={() => setGarageOpen(false)}><form className="px-form" onSubmit={saveGarage}><label>Garage name<input name="name" required/></label><label>Phone<input name="phone" required/></label><label>Services<input name="services" placeholder="Installation, diagnostics" required/></label><label>Address<textarea name="address" required/></label><button className="px-btn px-btn-red" type="submit">Save garage</button></form></Modal>}
    {locationOpen && <Modal title="Update delivery location" close={() => setLocationOpen(false)}><form className="px-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setLocation({ ...location, label: String(data.get("label")), address: String(data.get("address")) }); setLocationOpen(false); }}><label>Label<input name="label" defaultValue={location.label} required/></label><label>Full address<textarea name="address" defaultValue={location.address} required/></label><p className="px-form-note">The production API can replace this demo form with your DiagHub location picker.</p><button className="px-btn px-btn-red" type="submit">Update location</button></form></Modal>}
  </div>;
}

export function CartPage() {
  const { cart, cartTotal, setQuantity, removeFromCart } = usePartX();
  const delivery = cartTotal >= 999 ? 0 : 99;
  return <div className="px-page px-container"><div className="px-page-title"><span>YOUR BAG</span><h1>Cart</h1><p>{cart.length ? `${cart.length} part${cart.length > 1 ? "s" : ""} ready for checkout.` : "Your cart is waiting for the right parts."}</p></div>
    {!cart.length ? <div className="px-empty"><Icon name="cart"/><h2>Your cart is empty</h2><p>Browse vehicle-verified parts and add what you need.</p><Link href="/shop" className="px-btn px-btn-red">Shop parts <Icon name="arrow"/></Link></div> : <div className="px-cart-layout"><div className="px-cart-lines">{cart.map(({ product, quantity, storeName, unitPrice }) => <article key={product.id}><Image src={product.imageUrl ?? `/parts/${product.imageIndex}-v2.png`} alt={product.name} width={220} height={160}/><div><span>{product.brand}</span><Link href={`/shop/${product.id}`}><h2>{product.name}</h2></Link><p>{product.partNumber} · {product.deliveryLabel}</p><p className="px-cart-seller"><Icon name="store"/>Sold by <b>{storeName ?? product.seller}</b></p><div className="px-qty"><button onClick={() => setQuantity(product.id, quantity - 1)}>−</button><b>{quantity}</b><button onClick={() => setQuantity(product.id, quantity + 1)}>+</button></div></div><div className="px-line-price"><strong>₹{((unitPrice ?? product.price) * quantity).toLocaleString("en-IN")}</strong><button onClick={() => removeFromCart(product.id)} aria-label={`Remove ${product.name}`}><Icon name="trash"/>Remove</button></div></article>)}</div><aside className="px-summary"><span>ORDER SUMMARY</span><h2>Payment details</h2><dl><div><dt>Parts total</dt><dd>₹{cartTotal.toLocaleString("en-IN")}</dd></div><div><dt>Delivery</dt><dd>{delivery ? `₹${delivery}` : "FREE"}</dd></div><div><dt>Estimated tax</dt><dd>Included</dd></div><div className="total"><dt>Total</dt><dd>₹{(cartTotal + delivery).toLocaleString("en-IN")}</dd></div></dl><Link href="/checkout" className="px-btn px-btn-red px-btn-large">Secure checkout <Icon name="arrow"/></Link><small>Test payments only · No money will be charged</small></aside></div>}
  </div>;
}

export function CheckoutPage() {
  const router = useRouter();
  const { cart, cartTotal, location, garages, stores, placeOrder, submitUpiReference, cancelPayment, user } = usePartX();
  const [fulfilment, setFulfilment] = useState<FulfilmentMode>("delivery");
  const [payment, setPayment] = useState<PaymentMethod>("upi");
  const [processing, setProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [attempt, setAttempt] = useState<Awaited<ReturnType<typeof placeOrder>> | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [transactionReference, setTransactionReference] = useState("");
  const delivery = fulfilment === "delivery" && cartTotal < 999 ? 99 : 0;
  const selectedStore = stores.find((store) => store.id === cart[0]?.storeId) ?? stores[0];
  const total = cartTotal + delivery;
  const paymentSettings = selectedStore?.paymentSettings;
  const enabledMethods = ([paymentSettings?.upiEnabled ? "upi" : null, paymentSettings?.codEnabled ? "cod" : null].filter(Boolean)) as PaymentMethod[];
  const selectedPayment = enabledMethods.includes(payment) ? payment : enabledMethods[0];
  const upiUri = attempt?.sellerUpiIdSnapshot && attempt.sellerUpiNameSnapshot && isValidUpiId(attempt.sellerUpiIdSnapshot) ? createUpiUri({ upiId: attempt.sellerUpiIdSnapshot, displayName: attempt.sellerUpiNameSnapshot, amount: attempt.total, orderId: attempt.id }) : "";
  if (!cart.length) return <div className="px-page px-container"><div className="px-empty"><h1>No items to checkout</h1><p>Add a part before starting checkout.</p><Link href="/shop" className="px-btn px-btn-red">Shop parts</Link></div></div>;
  const attemptKey = `partx-payment-attempt:${user?.id ?? "guest"}:${selectedStore.id}:${fulfilment}:${cart.map((line) => `${line.product.id}-${line.quantity}`).join("|")}`;
  const startPayment = async () => {
    if (!selectedPayment) { setCheckoutError(`${selectedStore.name} has not enabled a payment method yet.`); return; }
    setProcessing(true); setCheckoutError("");
    try {
      const savedAttemptId = selectedPayment === "upi" ? readBrowserStorage("session", attemptKey) ?? undefined : undefined;
      let order;
      try {
        order = await placeOrder(fulfilment, selectedPayment, savedAttemptId);
      } catch (reason) {
        const errorCode = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
        if (savedAttemptId && reason instanceof Error && (reason.message === "SAVED_PAYMENT_ATTEMPT_INACTIVE" || errorCode === "permission-denied")) {
          removeBrowserStorage("session", attemptKey);
          order = await placeOrder(fulfilment, selectedPayment);
        } else {
          throw reason;
        }
      }
      if (selectedPayment === "cod") {
        router.push(`/orders/${order.id}?placed=1&payment=cod`);
        return;
      }
      writeBrowserStorage("session", attemptKey, order.id);
      setAttempt(order);
      setShowQr(true);
    } catch (reason) {
      setCheckoutError(reason instanceof Error ? reason.message : "The order could not be sent to the seller. Please try again.");
    } finally {
      setProcessing(false);
    }
  };
  const launchUpi = (packageName?: string) => {
    if (!upiUri) return;
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const target = packageName && isAndroid
      ? createAndroidUpiIntent(upiUri, packageName)
      : packageName && isIos ? createIosUpiLink(upiUri, packageName) : upiUri;
    window.location.href = target;
  };
  const submitReference = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!attempt || !isValidUtr(transactionReference)) { setCheckoutError("Enter a valid UPI transaction ID, UTR or reference number."); return; }
    setProcessing(true); setCheckoutError("");
    try {
      await submitUpiReference(attempt.id, transactionReference);
      removeBrowserStorage("session", attemptKey);
      router.push(`/orders/${attempt.id}?payment=submitted`);
    } catch (reason) {
      const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
      setCheckoutError(code === "permission-denied"
        ? "This UTR could not be submitted. It may already be attached to another order. Check the number and try again."
        : reason instanceof Error ? reason.message : "The payment reference could not be submitted.");
      setProcessing(false);
    }
  };
  const cancel = async () => {
    if (!attempt) return;
    setProcessing(true); setCheckoutError("");
    try {
      await cancelPayment(attempt.id);
      removeBrowserStorage("session", attemptKey);
      setAttempt(null); setShowQr(false); setTransactionReference("");
    } catch (reason) {
      setCheckoutError(reason instanceof Error ? reason.message : "The payment attempt could not be cancelled.");
    } finally {
      setProcessing(false);
    }
  };
  return <div className="px-page px-container"><Link className="px-back-link" href="/cart"><Icon name="back"/>Back to cart</Link><div className="px-page-title"><span>SECURE CHECKOUT</span><h1>Choose how you receive it</h1><p>Pay the selected seller directly by UPI or choose cash on delivery.</p></div>
    <div className="px-checkout-layout"><div className="px-checkout-main"><section className="px-panel"><div className="px-step-title"><b>1</b><div><span>FULFILMENT</span><h2>Delivery, pickup or garage</h2></div></div><div className="px-choice-grid">{(["delivery", "pickup", "garage"] as FulfilmentMode[]).map((mode) => <button className={fulfilment === mode ? "active" : ""} onClick={() => setFulfilment(mode)} key={mode}><Icon name={mode === "delivery" ? "pin" : mode === "pickup" ? "orders" : "garage"}/><b>{mode === "delivery" ? "Deliver to me" : mode === "pickup" ? "Self pickup" : "Send to garage"}</b><span>{mode === "delivery" ? location.address : mode === "pickup" ? `${selectedStore.name} · ${selectedStore.distanceKm} km` : garages[0]?.name ?? "Add a garage first"}</span></button>)}</div></section>
      <section className="px-panel"><div className="px-step-title"><b>2</b><div><span>PAYMENT</span><h2>Pay the seller directly</h2></div></div>{enabledMethods.length ? <div className="px-payment-row">{enabledMethods.map((method) => <button className={selectedPayment === method ? "active" : ""} disabled={Boolean(attempt)} onClick={() => setPayment(method)} key={method}>{method === "upi" ? "UPI" : "Cash on delivery"}</button>)}</div> : <div className="px-payment-unavailable" role="alert">{selectedStore.name} has not enabled UPI or cash on delivery. Contact the seller before ordering.</div>}{selectedPayment === "upi" && !attempt ? <div className="px-upi"><b>Direct seller payment</b><span>Your payment goes to {selectedStore.name}. PartX does not collect or hold the money.</span></div> : null}{attempt && upiUri ? <div className="px-upi-payment"><div className="px-upi-heading"><span>PAYMENT ATTEMPT {attempt.id}</span><h3>Paying ₹{attempt.total.toLocaleString("en-IN")} to {attempt.sellerUpiNameSnapshot}</h3><p>UPI ID <b>{attempt.sellerUpiIdSnapshot}</b><button type="button" onClick={() => navigator.clipboard?.writeText(attempt.sellerUpiIdSnapshot ?? "")}><Icon name="copy"/>Copy</button></p></div>{showQr ? <div className="px-upi-qr"><QRCodeSVG value={upiUri} size={210} level="M" marginSize={2}/><small>Exact amount · INR · Reference {attempt.id}</small></div> : null}<div className="px-upi-apps"><b>Choose a UPI app</b><div><button type="button" onClick={() => launchUpi("com.google.android.apps.nbu.paisa.user")}>Google Pay</button><button type="button" onClick={() => launchUpi("com.phonepe.app")}>PhonePe</button><button type="button" onClick={() => launchUpi("net.one97.paytm")}>Paytm</button><button type="button" onClick={() => launchUpi("in.org.npci.upiapp")}>BHIM</button></div><small>Choose a specific app to avoid WhatsApp. If it is not installed, try another app or scan the QR code.</small></div><div className="px-upi-actions"><button type="button" className="px-btn px-btn-red" onClick={() => launchUpi()}>Other UPI app <Icon name="arrow"/></button><button type="button" className="px-btn px-btn-outline" onClick={() => setShowQr((shown) => !shown)}>{showQr ? "Hide QR code" : "Show QR code"}</button></div><form className="px-utr-form" onSubmit={submitReference}><h3>Already paid?</h3><p>Copy the UPI transaction ID, UTR or reference from your payment app and submit it here. The seller will verify receipt.</p><label>UPI Transaction ID / UTR / Reference Number<input value={transactionReference} onChange={(event) => setTransactionReference(event.target.value.toUpperCase())} autoComplete="off" inputMode="text" required placeholder="Enter 6–40 letters or numbers"/></label><div><button className="px-btn px-btn-red" type="submit" disabled={processing}>{processing ? "Submitting…" : "Submit payment reference"}</button><button className="px-btn px-btn-outline" type="button" onClick={() => launchUpi()}>Try another UPI app</button><button className="px-link-button" type="button" onClick={() => void cancel()}>Cancel</button></div><small>Never enter your UPI PIN in PartX. Paying again may result in a duplicate payment.</small></form></div> : null}</section></div>
      <aside className="px-summary"><span>ORDER SUMMARY</span><h2>{cart.length} item{cart.length > 1 ? "s" : ""}</h2><div className="px-checkout-products">{cart.map(({ product, quantity, unitPrice }) => <div key={product.id}><Image src={product.imageUrl ?? `/parts/${product.imageIndex}-v2.png`} alt={product.name} width={72} height={58}/><span><b>{product.name}</b><small>{product.partNumber} · Qty {quantity}</small></span><strong>₹{((unitPrice ?? product.price) * quantity).toLocaleString("en-IN")}</strong></div>)}</div><p className="px-summary-seller"><Icon name="store"/>Seller: <b>{cart[0]?.storeName ?? cart[0]?.product.seller}</b></p><dl><div><dt>Subtotal</dt><dd>₹{cartTotal.toLocaleString("en-IN")}</dd></div><div><dt>Delivery</dt><dd>{delivery ? `₹${delivery}` : "FREE"}</dd></div><div><dt>Discount</dt><dd>₹0</dd></div><div className="total"><dt>Total amount</dt><dd>₹{total.toLocaleString("en-IN")}</dd></div></dl>{checkoutError ? <p className="px-checkout-error" role="alert">{checkoutError}</p> : null}{!attempt ? <button className="px-btn px-btn-red px-btn-large" onClick={() => void startPayment()} disabled={processing || !selectedPayment}>{processing ? "Creating order…" : selectedPayment === "cod" ? `Place COD order · ₹${total.toLocaleString("en-IN")}` : `Continue with UPI · ₹${total.toLocaleString("en-IN")}`}<Icon name="arrow"/></button> : <div className="px-payment-pending-note"><b>Order not confirmed yet</b><span>Submit your UTR, then wait for the seller to verify the payment.</span></div>}<small>PartX charges 0% commission and does not hold this payment.</small></aside></div>
  </div>;
}

export function OrdersPage() {
  const { orders } = usePartX();
  return <div className="px-page px-container"><div className="px-page-heading-row"><div className="px-page-title"><span>PURCHASE HISTORY</span><h1>My orders</h1><p>Track placed orders and get help with any issue.</p></div><Link href="/support" className="px-btn px-btn-outline"><Icon name="headset"/>Contact support</Link></div><div className="px-order-list">{orders.map((order) => <article key={order.id}><div><span>ORDER {order.id}</span><h2>{customerOrderLabel(order)}</h2><p>Placed {order.placedAt} · {order.eta}</p></div><div className="px-order-progress"><i className={`stage-${["Confirmed", "Preparing", "Picked up", "On the way", "Delivered"].indexOf(order.stage) + 1}`}/><div>{["Confirmed", "Preparing", "On the way", "Delivered"].map((stage) => <span key={stage}>{stage}</span>)}</div></div><strong>₹{order.total.toLocaleString("en-IN")}</strong><div className="px-order-actions"><Link href={`/orders/${order.id}`} className="px-btn px-btn-dark">View details <Icon name="arrow"/></Link><Link href={`/support?order=${order.id}`}>Get help</Link></div></article>)}</div></div>;
}

export function OrderDetailPage({ id }: { id: string }) {
  const params = useSearchParams();
  const { orders, submitStoreRating, liveOrderUpdate, submitUpiReference } = usePartX();
  const { addRating, ratings } = useSeller();
  const order = orders.find((item) => item.id === id);
  const alreadyRated = ratings.some((rating) => rating.orderId === id);
  const [ratingDismissed, setRatingDismissed] = useState(false);
  const [rated, setRated] = useState(alreadyRated);
  const [replacementReference, setReplacementReference] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const ratingOpen = order?.stage === "Delivered" && !alreadyRated && !ratingDismissed;
  if (!order) return <div className="px-page px-container"><div className="px-empty"><h1>Order not found</h1><Link href="/orders" className="px-btn px-btn-dark">View all orders</Link></div></div>;
  return <div className="px-page px-container">
    <Link href="/orders" className="px-back-link"><Icon name="back"/>All orders</Link>
    {params.get("placed") === "1" && order.orderStatus === "PLACED" && liveOrderUpdate?.orderId !== order.id ? <div className="px-order-live-note" role="status"><Icon name="bell"/><div><b>Order placed successfully</b><span>{order.paymentMethod === "cod" ? `Pay ₹${order.total.toLocaleString("en-IN")} on delivery or pickup.` : `The seller was notified and this order is now in their packing queue.`}</span></div></div> : null}
    {params.get("payment") === "submitted" || order.paymentStatus === "PAYMENT_SUBMITTED" ? <div className="px-order-live-note px-payment-review-note" role="status"><Icon name="orders"/><div><b>Payment verification in progress</b><span>₹{order.total.toLocaleString("en-IN")} payment submitted to {order.storeName}. Reference: {order.paymentReference}. Your order will be confirmed after the seller verifies it.</span></div></div> : null}
    {order.paymentStatus === "PAID" ? <div className="px-order-live-note" role="status"><Icon name="check"/><div><b>Payment confirmed ✓</b><span>Order placed successfully. {order.storeName} can now prepare your order.</span></div></div> : null}
    {liveOrderUpdate?.orderId === order.id ? <div className="px-order-live-note px-order-status-note" role="status" aria-live="polite"><Icon name="orders"/><div><b>Live order update: {liveOrderUpdate.stage}</b><span>{order.storeName ?? "Your seller"} updated your order status just now.</span></div></div> : null}
    <div className="px-tracking-hero"><span>ORDER {order.id}</span><h1>{customerOrderLabel(order)}</h1><p>{order.eta}</p>{order.orderStatus === "PLACED" ? <div className="px-tracking-steps">{["Confirmed", "Preparing", "Picked up", "On the way", "Delivered"].map((stage, index) => { const reached = index <= ["Confirmed", "Preparing", "Picked up", "On the way", "Delivered"].indexOf(order.stage); return <div className={reached ? "done" : ""} key={stage}><i>{reached ? <Icon name="check"/> : index + 1}</i><b>{stage}</b></div>; })}</div> : null}</div>
    <div className="px-dashboard-grid"><section className="px-panel px-panel-wide"><span>ORDER DETAILS</span><h2>{order.items?.length ?? 1} item{(order.items?.length ?? 1) > 1 ? "s" : ""} · ₹{order.total.toLocaleString("en-IN")}</h2><p>Tracking ID: {order.trackingId ?? "PX-TRK-78451236"} · Fulfilment: {order.fulfilment ?? "delivery"} · Seller: {order.storeName ?? "Your selected seller"}</p><p>Payment: <b>{customerPaymentLabel(order)}</b>{order.paymentReference ? ` · Reference ${order.paymentReference}` : ""}</p>{order.stage === "Delivered" ? <button className="px-btn px-btn-red" onClick={() => setRatingDismissed(false)}>{rated || alreadyRated ? "Rating submitted" : "Rate this store"}</button> : null}{order.paymentStatus === "VERIFICATION_FAILED" ? <form className="px-payment-retry" onSubmit={(event) => { event.preventDefault(); setPaymentError(""); void submitUpiReference(order.id, replacementReference).then(() => { setPaymentMessage("Updated reference submitted for seller verification."); setReplacementReference(""); }).catch((reason) => setPaymentError(reason instanceof Error ? reason.message : "Reference could not be submitted.")); }}><h3>Payment not found</h3><p>Check your UPI app and enter the correct UTR. Do not pay again unless you are certain the first payment failed.</p><label>Correct UPI transaction reference<input value={replacementReference} onChange={(event) => setReplacementReference(event.target.value.toUpperCase())} required/></label><button className="px-btn px-btn-red" type="submit">Submit corrected reference</button>{paymentMessage ? <span role="status">{paymentMessage}</span> : null}{paymentError ? <span role="alert">{paymentError}</span> : null}</form> : null}</section><section className="px-panel"><span>NEED HELP?</span><h2>We’re here for this order</h2><p>Report delivery, fitment, payment, return, or wrong-part issues.</p><Link href={`/support?order=${order.id}`} className="px-btn px-btn-outline">Contact us</Link></section></div>
    {ratingOpen ? <RatingDialog orderId={order.id} storeId={order.storeId ?? "autohub-mumbai"} storeName={order.storeName ?? "your selected store"} close={() => setRatingDismissed(true)} submit={(stars, comment) => { addRating({ orderId: order.id, storeId: order.storeId ?? "autohub-mumbai", customerName: "Akshay Singh", stars, comment }); submitStoreRating(order.storeId ?? "autohub-mumbai", stars); setRated(true); setRatingDismissed(true); }}/> : null}
  </div>;
}

export function OffersPage() {
  return <div className="px-page px-container"><div className="px-page-title"><span>SAVE ON THE RIGHT PART</span><h1>Offers</h1><p>Clear savings with no hidden conditions.</p></div><div className="px-offers-grid"><article className="secondary"><span>DELIVERY</span><strong>₹0<small>ABOVE ₹999</small></strong><h2>Free doorstep delivery</h2><p>Available on eligible parts and serviceable Mumbai locations.</p><Link href="/shop" className="px-btn px-btn-dark">Shop eligible parts</Link></article></div></div>;
}

export function AccountPage() {
  const router = useRouter();
  const { location, vehicles, orders, user, signOut } = usePartX();
  const initials = user?.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "PX";
  const links = [["/garage", "garage", "My garage", `${vehicles.length} vehicles · ${location.label}`], ["/orders", "orders", "My orders", `${orders.length} orders`], ["/offers", "offer", "Offers", "Delivery savings"], ["/support", "headset", "Help & support", "Issues, returns and contact"], ["/sell", "plus", "Add your store", "Sell products at your prices"]];
  return <div className="px-page px-container"><div className="px-account-hero"><div className="px-avatar">{initials}</div><div><span>PARTX CUSTOMER</span><h1>{user?.name}</h1><p>{user?.email} · {user?.mobile}</p></div><div className="px-account-actions">{user?.roles.includes("seller") ? <Link href="/seller" className="px-btn px-btn-dark"><Icon name="store"/>Switch to Seller</Link> : null}<button className="px-btn px-btn-outline" onClick={() => { signOut(); router.replace("/login"); }}><Icon name="logout"/>Sign out</button></div></div><div className="px-account-links">{links.map(([href, icon, title, subtitle]) => <Link href={href} key={href}><span className="px-square-icon"><Icon name={icon}/></span><div><b>{title}</b><span>{subtitle}</span></div><Icon name="chevron"/></Link>)}</div></div>;
}

export function SupportPage() {
  const params = useSearchParams(); const { orders } = usePartX(); const { addTicket } = useSeller(); const [ticketId, setTicketId] = useState("");
  return <div className="px-page px-container"><div className="px-page-title"><span>PARTX SUPPORT</span><h1>How can we help?</h1><p>Tell us what happened and tie it to an order for a faster response.</p></div><div className="px-support-layout"><form className="px-panel px-form" onSubmit={(event) => { event.preventDefault(); const data=new FormData(event.currentTarget); const ticket=addTicket({orderId:String(data.get("order")||"GENERAL"),issue:String(data.get("issue")),message:String(data.get("message"))});setTicketId(ticket.id);event.currentTarget.reset(); }}><label>Order<select name="order" defaultValue={params.get("order") ?? ""}><option value="">General question</option>{orders.map((order) => <option value={order.id} key={order.id}>{order.id} · {order.stage}</option>)}</select></label><label>Issue type<select name="issue"><option>Delivery issue</option><option>Wrong part received</option><option>Fitment issue</option><option>Payment issue</option><option>Return or refund</option><option>Other</option></select></label><label>Tell us what happened<textarea name="message" required placeholder="Include any details that will help our support team."/></label><button className="px-btn px-btn-red" type="submit">{ticketId ? `Ticket created · ${ticketId}` : "Submit support request"}</button>{ticketId?<p className="px-ticket-success"><Icon name="check"/>The seller has been alerted with your order and issue details.</p>:null}</form><aside className="px-support-aside"><div><Icon name="headset"/><h2>Order-specific help</h2><p>Support requests are stored locally in this demo and can later post to your support API.</p></div><div><b>Typical response</b><strong>Under 2 hours</strong><span>Monday–Saturday, 9 AM–8 PM</span></div></aside></div></div>;
}

export function SellPage() {
  const { addStore, stores } = usePartX(); const [saved, setSaved] = useState("");
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name")); const store: PartnerStore = { id: `store-${Date.now()}`, name, owner: String(data.get("owner")), phone: String(data.get("phone")), gstin: String(data.get("gstin")), businessHours: String(data.get("hours")), deliveryRadiusKm: Number(data.get("radius")), rating: 0, distanceKm: 0, location: { id: `store-location-${Date.now()}`, label: "Store", address: String(data.get("address")) }, listings: [] }; addStore(store); setSaved(name); event.currentTarget.reset(); };
  return <div className="px-page px-container"><div className="px-page-title"><span>PARTX SELLER ONBOARDING</span><h1>Add your store</h1><p>Create a demo storefront now. Product and price management can later write directly to Firebase.</p></div><div className="px-support-layout"><form className="px-panel px-form" onSubmit={save}><div className="px-form-grid"><label>Store name<input name="name" required/></label><label>Owner name<input name="owner" required/></label><label>Phone<input name="phone" required/></label><label>GSTIN<input name="gstin"/></label><label>Business hours<input name="hours" defaultValue="9:00 AM – 8:00 PM" required/></label><label>Delivery radius (km)<input name="radius" type="number" defaultValue="8" required/></label></div><label>Store address<textarea name="address" required/></label><button className="px-btn px-btn-red" type="submit">{saved ? `${saved} added` : "Add store"}</button></form><aside className="px-support-aside"><div><span>DEMO NETWORK</span><h2>{stores.length} stores onboarded</h2><p>Each store can later manage its own parts, stock, pricing and delivery radius from a protected seller dashboard.</p></div><Link href="/shop" className="px-btn px-btn-outline">View customer catalog</Link></aside></div></div>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="px-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="px-modal" role="dialog" aria-modal="true" aria-label={title}><div className="px-modal-head"><h2>{title}</h2><button onClick={close} aria-label="Close"><Icon name="close"/></button></div>{children}</div></div>;
}

function customerOrderLabel(order: PartXOrder) {
  if (order.paymentStatus === "PENDING") return "Payment pending";
  if (order.paymentStatus === "PAYMENT_SUBMITTED") return "Payment verification pending";
  if (order.paymentStatus === "VERIFICATION_FAILED") return "Payment not found";
  if (order.paymentStatus === "PAYMENT_EXPIRED") return "Payment expired";
  if (order.paymentStatus === "PAYMENT_CANCELLED") return "Payment cancelled";
  return order.stage;
}

function customerPaymentLabel(order: PartXOrder) {
  if (order.paymentStatus === "PAID" || order.paymentStatus === "Paid") return "Payment confirmed";
  if (order.paymentStatus === "PAYMENT_DUE" || order.paymentStatus === "COD") return "Pay on delivery or pickup";
  if (order.paymentStatus === "PAYMENT_SUBMITTED") return "Awaiting seller verification";
  if (order.paymentStatus === "VERIFICATION_FAILED") return "Seller could not find payment";
  if (order.paymentStatus === "PAYMENT_EXPIRED") return "Payment attempt expired";
  if (order.paymentStatus === "PAYMENT_CANCELLED") return "Payment attempt cancelled";
  return "Payment not submitted";
}

function RatingDialog({orderId,storeId,storeName,close,submit}:{orderId:string;storeId:string;storeName:string;close:()=>void;submit:(stars:number,comment:string)=>void}){
  const [stars,setStars]=useState(5);const [comment,setComment]=useState("");
  return <div className="px-modal-backdrop"><div className="px-modal px-rating-dialog" role="dialog" aria-modal="true" aria-label={`Rate ${storeName}`}><div className="px-modal-head"><div><span>DELIVERY COMPLETE</span><h2>How was {storeName}?</h2></div><button onClick={close} aria-label="Rate later"><Icon name="close"/></button></div><p>Your verified rating will appear when customers choose a seller.</p><div className="px-rating-stars" aria-label={`${stars} stars`}>{[1,2,3,4,5].map((value)=><button className={value<=stars?"active":""} onClick={()=>setStars(value)} key={value} aria-label={`${value} stars`}><Icon name="star"/></button>)}</div><label>Share an optional comment<textarea value={comment} onChange={(event)=>setComment(event.target.value)} placeholder="Part quality, packing and delivery experience"/></label><div className="px-rating-actions"><button className="px-btn px-btn-outline" onClick={close}>Rate later</button><button className="px-btn px-btn-red" onClick={()=>submit(stars,comment)}>Submit verified rating</button></div><small>Order {orderId} · Store {storeId}</small></div></div>;
}
