"use client";

import Image from "next/image";
import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";
import { demoApi } from "@/lib/api/client";
import { activeOrder } from "@/lib/demo-data";
import type { CartLine, Order, Product, Vehicle } from "@/lib/types";

const categories = ["All", "Brakes", "Filters", "Batteries", "Lighting", "Suspension", "Engine"];
const stages = ["Confirmed", "Preparing", "Picked up", "On the way", "Delivered"] as const;

function Icon({ name, size = 20 }: { name: "search" | "home" | "grid" | "car" | "orders" | "user" | "cart" | "check" | "truck" | "close" | "minus" | "plus" | "arrow"; size?: number }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    car: <><path d="M5 17h14l-1-7-2-3H8L6 10l-1 7Z"/><path d="M7 10h10M7 17v2m10-2v2"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></>,
    orders: <><path d="M7 3h10l2 3v15H5V6l2-3Z"/><path d="M5 7h14M9 11h6m-6 4h6"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    cart: <><path d="M3 4h2l2 11h10l3-7H7"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    truck: <><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
    close: <path d="m5 5 14 14M19 5 5 19"/>,
    minus: <path d="M5 12h14"/>,
    plus: <path d="M5 12h14M12 5v14"/>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function SpriteImage({ index, className = "" }: { index: number; className?: string }) {
  return (
    <div className={`sprite-image ${className}`}>
      <Image src={`/parts/${index}-v2.png`} alt="" fill sizes="(max-width: 640px) 50vw, 260px" />
    </div>
  );
}

function CategoryImage({ index }: { index: number }) {
  return (
    <div className="category-image">
      <Image src={`/categories/${index}-v2.png`} alt="" fill sizes="(max-width: 640px) 33vw, 240px" />
    </div>
  );
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function Logo() {
  return (
    <div className="logo" aria-label="MotoPart home">
      <span className="logo-mark"><span /></span>
      <span>Moto<span>Part</span></span>
    </div>
  );
}

function ProductCard({ product, compatible, onAdd, onOpen }: { product: Product; compatible: boolean; onAdd: (product: Product) => void; onOpen: (product: Product) => void }) {
  return (
    <article className="product-card">
      <button className="product-visual" onClick={() => onOpen(product)} aria-label={`View ${product.name}`}>
        <SpriteImage index={product.imageIndex} />
      </button>
      <div className="product-body">
        <div className="product-kicker"><strong>{product.brand}</strong><span>{product.kind}</span></div>
        <button className="product-name" onClick={() => onOpen(product)}>{product.name}</button>
        <div className="part-number">{product.partNumber}</div>
        <div className="rating"><b>★ {product.rating}</b><span>({product.reviews.toLocaleString("en-IN")})</span></div>
        <div className="price"><strong>{formatPrice(product.price)}</strong><del>{formatPrice(product.listPrice)}</del></div>
        <div className={`fit ${compatible ? "is-fit" : "not-fit"}`}><span><Icon name={compatible ? "check" : "close"} size={15}/>{compatible ? "Fits your vehicle" : "Check fitment"}</span><b>{product.stock > 0 ? "In stock" : "Unavailable"}</b></div>
        <div className="delivery"><Icon name="truck" size={16}/><span>{product.deliveryLabel}</span></div>
        <button className="add-button" onClick={() => onAdd(product)}><Icon name="cart" size={17}/>Add to cart</button>
      </div>
    </article>
  );
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        {children}
      </section>
    </div>
  );
}

export function Storefront({ initialProducts, initialVehicles }: { initialProducts: Product[]; initialVehicles: Vehicle[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [vehicles] = useState(initialVehicles);
  const [activeVehicleId, setActiveVehicleId] = useState(initialVehicles[0].id);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [order, setOrder] = useState<Order>(activeOrder);
  const [toast, setToast] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [mobileNavVisible, setMobileNavVisible] = useState(false);

  const vehicle = vehicles.find((item) => item.id === activeVehicleId) ?? vehicles[0];
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  const allowedProducts = useMemo(() => products.map((product) => ({ product, compatible: product.compatibleVehicleIds.includes(activeVehicleId) })), [products, activeVehicleId]);

  useEffect(() => {
    const updateMobileNav = () => setMobileNavVisible(window.scrollY > 240);
    updateMobileNav();
    window.addEventListener("scroll", updateMobileNav, { passive: true });
    return () => window.removeEventListener("scroll", updateMobileNav);
  }, []);

  async function filterCatalog(nextQuery = query, nextCategory = category) {
    setIsFiltering(true);
    try {
      const result = await demoApi.getParts({ query: nextQuery, category: nextCategory, vehicleId: activeVehicleId });
      startTransition(() => setProducts(result));
    } finally {
      setIsFiltering(false);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void filterCatalog();
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
  }

  function chooseCategory(nextCategory: string) {
    setCategory(nextCategory);
    void filterCatalog(query, nextCategory);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { product, quantity: 1 }];
    });
    showToast(`${product.name} added to cart`);
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line];
      const quantity = line.quantity + delta;
      return quantity > 0 ? [{ ...line, quantity }] : [];
    }));
  }

  async function placeOrder() {
    const created = await demoApi.checkout({ address: "Home · Bandra West, Mumbai", delivery: "Standard · Tomorrow", payment: "UPI", productIds: cart.map((line) => line.product.id) });
    setOrder(created);
    setCheckoutStep(4);
    setCart([]);
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <form className="search" onSubmit={submitSearch}>
            <Icon name="search" size={21}/>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search parts, OEM or part number" aria-label="Search catalogue" />
            <button type="submit">Search</button>
          </form>
          <button className="vehicle-control" onClick={() => setVehicleOpen(true)}><Icon name="car"/><span><small>Selected vehicle</small>{vehicle.year} {vehicle.make} {vehicle.model}</span><b>⌄</b></button>
          <button className="mobile-cart-button" onClick={() => setCartOpen(true)} aria-label={`Open cart with ${cartCount} items`}><Icon name="cart"/>{cartCount > 0 ? <em>{cartCount}</em> : null}</button>
          <nav className="header-actions" aria-label="Account actions">
            <button onClick={() => document.getElementById("tracking")?.scrollIntoView({ behavior: "smooth" })}><Icon name="orders"/><span>Orders</span></button>
            <button><Icon name="user"/><span>Account</span></button>
            <button className="cart-button" onClick={() => setCartOpen(true)}><Icon name="cart"/><span>Cart</span>{cartCount > 0 ? <em>{cartCount}</em> : null}</button>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero page-shell">
          <div className="hero-copy">
            <h1>Find the exact part<br/>for your vehicle.<br/><span>And get it delivered fast.</span></h1>
            <p>Vehicle-verified parts from trusted sellers, with delivery timing before you buy.</p>
            <div className="promise-row">
              <span><Icon name="check"/>Compatible</span><span><Icon name="check"/>Available</span><span><Icon name="truck"/>Delivered fast</span>
            </div>
            <button className="primary-button" onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}>Shop compatible parts <Icon name="arrow"/></button>
          </div>
          <div className="vehicle-panel">
            <div className="technical-corner technical-top"/><div className="technical-corner technical-bottom"/>
            <div className="vehicle-panel-head"><span>Your vehicle</span><button onClick={() => setVehicleOpen(true)}>Change</button></div>
            <Image src="/vehicle-suv.png" width={680} height={450} priority alt="Selected black compact SUV" />
            <div className="vehicle-details">
              <div><small>Vehicle</small><b>{vehicle.make} {vehicle.model}</b></div><div><small>Model year</small><b>{vehicle.year}</b></div><div><small>Variant</small><b>{vehicle.variant} {vehicle.fuel}</b></div><div><small>Transmission</small><b>{vehicle.transmission}</b></div>
            </div>
            <div className="verified-line"><span><Icon name="check" size={16}/></span>Showing parts that fit your <b>{vehicle.year} {vehicle.make} {vehicle.model}</b></div>
          </div>
        </section>

        <section className="category-wrap page-shell" aria-label="Part categories">
          {categories.slice(1).map((item, index) => <button key={item} className={category === item ? "active" : ""} onClick={() => chooseCategory(item)}><CategoryImage index={index}/><span>{item}</span><b>→</b></button>)}
        </section>

        <section className="catalog page-shell" id="catalog">
          <div className="section-heading">
            <div><h2>{category === "All" ? `Recommended for your ${vehicle.model}` : category}</h2><p>{isFiltering ? "Updating fitment-aware results…" : `${allowedProducts.length} verified parts available`}</p></div>
            {category !== "All" ? <button className="text-button" onClick={() => chooseCategory("All")}>View all parts <Icon name="arrow" size={16}/></button> : null}
          </div>
          {allowedProducts.length ? <div className="product-grid">{allowedProducts.map(({ product, compatible }) => <ProductCard key={product.id} product={product} compatible={compatible} onAdd={addToCart} onOpen={setSelectedProduct}/>)}</div> : <div className="empty-state"><h3>No exact matches yet</h3><p>Try a part name, brand, OEM number, or another category.</p><button onClick={() => { setQuery(""); chooseCategory("All"); }}>Clear search</button></div>}
        </section>

        <section className="tracking page-shell" id="tracking">
          <div className="track-title"><span>Track your order</span><b>#{order.id}</b><small>ETA {order.eta}</small></div>
          <div className="track-steps">
            {stages.map((stage, index) => {
              const activeIndex = stages.indexOf(order.stage);
              const complete = index <= activeIndex;
              return <div className={complete ? "complete" : ""} key={stage}><span>{complete ? <Icon name={index === 3 ? "truck" : "check"} size={15}/> : index + 1}</span><b>{stage}</b><small>{index === activeIndex ? "Current status" : index < activeIndex ? "Completed" : "Pending"}</small></div>;
            })}
          </div>
          <button className="secondary-button">View order</button>
        </section>

        <section className="trust page-shell"><span><Icon name="check"/><b>100% vehicle compatibility</b><small>Exact fit guarantee</small></span><span><Icon name="check"/><b>Genuine & quality parts</b><small>Trusted brands and sellers</small></span><span><Icon name="truck"/><b>Easy returns</b><small>7-day return policy</small></span><span><Icon name="orders"/><b>Secure payments</b><small>UPI, cards and COD</small></span></section>
      </main>

      <nav className={`mobile-nav ${mobileNavVisible ? "is-visible" : ""}`} aria-label="Mobile navigation">
        <button className="active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span className="nav-icon"><Icon name="home" size={21}/></span><span>Home</span></button>
        <button onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}><span className="nav-icon"><Icon name="grid" size={21}/></span><span>Shop</span></button>
        <button onClick={() => document.getElementById("tracking")?.scrollIntoView({ behavior: "smooth" })}><span className="nav-icon"><Icon name="orders" size={21}/></span><span>Orders</span></button>
        <button onClick={() => setCartOpen(true)}><span className="nav-icon"><Icon name="cart" size={21}/>{cartCount > 0 ? <em>{cartCount}</em> : null}</span><span>Cart</span></button>
      </nav>

      {vehicleOpen ? <Modal title="Choose your vehicle" onClose={() => setVehicleOpen(false)}><div className="vehicle-list">{vehicles.map((item) => <button key={item.id} className={item.id === activeVehicleId ? "selected" : ""} onClick={() => { setActiveVehicleId(item.id); setVehicleOpen(false); showToast(`${item.make} ${item.model} selected`); }}><Icon name="car"/><span><b>{item.year} {item.make} {item.model}</b><small>{item.variant} · {item.fuel} · {item.transmission}</small></span>{item.id === activeVehicleId ? <Icon name="check"/> : null}</button>)}<button className="add-vehicle"><Icon name="plus"/>Add another vehicle</button></div></Modal> : null}

      {selectedProduct ? <Modal title="Part details" onClose={() => setSelectedProduct(null)} wide><div className="product-detail"><div className="detail-image"><SpriteImage index={selectedProduct.imageIndex}/></div><div className="detail-copy"><span className="detail-brand">{selectedProduct.brand}</span><h3>{selectedProduct.name}</h3><p>{selectedProduct.kind} part supplied by {selectedProduct.seller}, covered by a {selectedProduct.warranty} warranty.</p><dl><div><dt>Part number</dt><dd>{selectedProduct.partNumber}</dd></div><div><dt>OEM reference</dt><dd>{selectedProduct.oemNumber}</dd></div><div><dt>Availability</dt><dd>{selectedProduct.stock} in stock</dd></div><div><dt>Delivery</dt><dd>{selectedProduct.deliveryLabel}</dd></div></dl><div className="detail-fit"><Icon name="check"/><span><b>Fits your {vehicle.make} {vehicle.model}</b><small>Verified for {vehicle.year} · {vehicle.variant} · {vehicle.transmission}</small></span></div><div className="detail-buy"><strong>{formatPrice(selectedProduct.price)}</strong><button className="primary-button" onClick={() => { addToCart(selectedProduct); setSelectedProduct(null); }}>Add to cart</button></div></div></div></Modal> : null}

      {cartOpen ? <div className="drawer-backdrop" onMouseDown={() => setCartOpen(false)}><aside className="cart-drawer" onMouseDown={(event) => event.stopPropagation()}><header><div><h2>Your cart</h2><p>{cartCount} {cartCount === 1 ? "item" : "items"} · checked for {vehicle.model}</p></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close cart"><Icon name="close"/></button></header><div className="cart-lines">{cart.length ? cart.map((line) => <div className="cart-line" key={line.product.id}><SpriteImage index={line.product.imageIndex}/><div><b>{line.product.name}</b><small><Icon name="check" size={14}/>Fits your vehicle</small><span>{formatPrice(line.product.price)}</span></div><div className="quantity"><button onClick={() => updateQuantity(line.product.id, -1)}><Icon name="minus" size={15}/></button><b>{line.quantity}</b><button onClick={() => updateQuantity(line.product.id, 1)}><Icon name="plus" size={15}/></button></div></div>) : <div className="cart-empty"><Icon name="cart" size={34}/><h3>Your cart is empty</h3><p>Add a compatible part to start your order.</p></div>}</div>{cart.length ? <footer><div><span>Subtotal</span><b>{formatPrice(subtotal)}</b></div><small>Taxes included · Delivery calculated next</small><button className="primary-button" onClick={() => { setCartOpen(false); setCheckoutStep(1); }}>Checkout securely <Icon name="arrow"/></button></footer> : null}</aside></div> : null}

      {checkoutStep > 0 ? <Modal title={checkoutStep === 4 ? "Order confirmed" : "Secure checkout"} onClose={() => setCheckoutStep(0)} wide><div className="checkout"><div className="checkout-progress">{["Address", "Delivery", "Payment"].map((label, index) => <span key={label} className={checkoutStep > index ? "active" : ""}><b>{checkoutStep > index + 1 || checkoutStep === 4 ? <Icon name="check" size={14}/> : index + 1}</b>{label}</span>)}</div>{checkoutStep === 1 ? <div className="checkout-panel"><h3>Where should we deliver?</h3><button className="choice selected"><span><b>Home</b><small>24 Hill Road, Bandra West, Mumbai 400050</small></span><Icon name="check"/></button><button className="choice"><span><b>Garage delivery</b><small>Send directly to your trusted mechanic</small></span></button><button className="primary-button" onClick={() => setCheckoutStep(2)}>Continue to delivery <Icon name="arrow"/></button></div> : null}{checkoutStep === 2 ? <div className="checkout-panel"><h3>Choose delivery speed</h3><button className="choice selected"><span><b>Standard · Tomorrow</b><small>By 11 AM · Free</small></span><Icon name="check"/></button><button className="choice"><span><b>Express · Today</b><small>Within 90 minutes · ₹149</small></span></button><button className="primary-button" onClick={() => setCheckoutStep(3)}>Continue to payment <Icon name="arrow"/></button></div> : null}{checkoutStep === 3 ? <div className="checkout-panel"><h3>Select payment method</h3><button className="choice selected"><span><b>UPI</b><small>Pay securely with any UPI app</small></span><Icon name="check"/></button><button className="choice"><span><b>Credit or debit card</b><small>Visa, Mastercard and RuPay</small></span></button><button className="primary-button" onClick={() => void placeOrder()}>Pay {formatPrice(subtotal)} <Icon name="arrow"/></button></div> : null}{checkoutStep === 4 ? <div className="order-success"><span><Icon name="check" size={30}/></span><h3>Your parts are booked.</h3><p>Order #{order.id} is confirmed. We’ll keep you updated through every delivery step.</p><button className="primary-button" onClick={() => setCheckoutStep(0)}>Track order</button></div> : null}</div></Modal> : null}

      {toast ? <div className="toast" role="status"><Icon name="check" size={17}/>{toast}</div> : null}
    </>
  );
}
