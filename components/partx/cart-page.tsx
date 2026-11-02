"use client";

import Image from "next/image";
import Link from "next/link";
import { usePartX } from "./app-provider";
import { ProductCard } from "./product-card";
import { Icon } from "./icons";
import { productHref } from "@/lib/navigation";

const relatedCategories: Record<string, string[]> = {
  Engine: ["Filters", "Ignition", "Engine Oil"],
  Filters: ["Engine", "Engine Oil", "Lubricants"],
  "Engine Oil": ["Filters", "Engine"],
  Lubricants: ["Filters", "Engine"],
  Brakes: ["Suspension", "Wheels & Tyres"],
  Suspension: ["Brakes", "Steering"],
  Batteries: ["Electrical", "Ignition"],
  Electrical: ["Batteries", "Lighting"],
  Ignition: ["Engine", "Batteries"],
};

export function CartPage() {
  const { cart, cartTotal, setQuantity, removeFromCart, catalog, vehicles, activeVehicleId } = usePartX();
  const vehicle = vehicles.find((item) => item.id === activeVehicleId);
  const vehicleIds = [activeVehicleId, vehicle?.vehicleModelId].filter(Boolean) as string[];
  const inCart = new Set(cart.map(({ product }) => product.id));
  const partNumbers = new Set(cart.map(({ product }) => product.partNumber?.trim().toLowerCase()).filter(Boolean));
  const categories = new Set(cart.map(({ product }) => product.category));
  const companions = new Set([...categories].flatMap((category) => relatedCategories[category] ?? []));
  const sellers = new Set(cart.map(({ product, storeName }) => storeName ?? product.seller));
  const suggestions = catalog
    .filter((product) => product.stock > 0 && !inCart.has(product.id)
      && (!product.partNumber || !partNumbers.has(product.partNumber.trim().toLowerCase()))
      && (!product.compatibleVehicleIds.length || product.compatibleVehicleIds.some((id) => vehicleIds.includes(id))))
    .map((product) => ({ product, score:
      (categories.has(product.category) ? 6 : 0)
      + (companions.has(product.category) ? 5 : 0)
      + (sellers.has(product.seller) ? 3 : 0)
      + (product.compatibleVehicleIds.some((id) => vehicleIds.includes(id)) ? 2 : 0)
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
    .filter(({ product }, index, list) => !product.partNumber || list.findIndex((item) => item.product.partNumber.trim().toLowerCase() === product.partNumber.trim().toLowerCase()) === index)
    .slice(0, 4)
    .map(({ product }) => product);
  const delivery = cartTotal >= 999 ? 0 : 99;

  return <div className="px-page px-container px-cart-page">
    <div className="px-cart-heading"><div><h1>Your cart <small>({cart.reduce((sum, line) => sum + line.quantity, 0)})</small></h1><p>{cart.length ? "Review your parts and proceed to checkout." : "Find the right parts for your vehicle."}</p></div><Link href="/shop">Continue shopping <Icon name="arrow"/></Link></div>
    {!cart.length ? <div className="px-empty"><Icon name="cart"/><h2>Your cart is empty</h2><Link href="/shop" className="px-btn px-btn-red">Shop parts <Icon name="arrow"/></Link></div> :
      <div className="px-cart-layout">
        <div className="px-cart-lines">{cart.map(({ product, quantity, storeName, unitPrice }) => <article key={product.id}>
          <Link className="px-cart-thumbnail" href={productHref(product.id)}><Image src={product.imageUrl ?? `/parts/${product.imageIndex}-v2.png`} alt={product.name} width={100} height={80}/></Link>
          <div className="px-cart-item-info"><Link href={productHref(product.id)}><h2>{product.name}</h2></Link><p>{product.partNumber}</p><p className="px-cart-seller"><Icon name="store"/><b>{storeName ?? product.seller}</b></p><div className="px-qty" aria-label={`Quantity for ${product.name}`}><button aria-label={`Decrease quantity of ${product.name}`} disabled={quantity <= 1} onClick={() => setQuantity(product.id, quantity - 1)}>−</button><b aria-live="polite">{quantity}</b><button aria-label={`Increase quantity of ${product.name}`} disabled={quantity >= product.stock} onClick={() => setQuantity(product.id, quantity + 1)}>+</button></div></div>
          <div className="px-line-price"><strong>₹{((unitPrice ?? product.price) * quantity).toLocaleString("en-IN")}</strong><button onClick={() => removeFromCart(product.id)} aria-label={`Remove ${product.name}`}><Icon name="trash"/>Remove</button></div>
        </article>)}</div>
        <aside className="px-summary"><h2>Order summary</h2><dl><div><dt>Parts total</dt><dd>₹{cartTotal.toLocaleString("en-IN")}</dd></div><div><dt>Estimated delivery</dt><dd>{delivery ? `₹${delivery}` : "FREE"}</dd></div><div className="total"><dt>Total</dt><dd aria-live="polite">₹{(cartTotal + delivery).toLocaleString("en-IN")}</dd></div></dl><Link href="/checkout" className="px-btn px-btn-red">Proceed to checkout <Icon name="arrow"/></Link><small>Tax included. Delivery and payment options confirmed at checkout.</small></aside>
      </div>}
    {cart.length > 0 && suggestions.length > 0 ? <section className="px-cart-suggestions" aria-labelledby="cart-suggestions-title"><div className="px-section-head"><div><h2 id="cart-suggestions-title">Parts you may also need</h2><p>Related categories and options for your {vehicle?.model ?? "selected vehicle"}. Check fitment before ordering.</p></div></div><div className="px-product-grid">{suggestions.map((product) => <ProductCard product={product} key={product.id}/>)}</div></section> : null}
  </div>;
}
