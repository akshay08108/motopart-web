"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getDemoCatalog } from "@/lib/demo-data";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";

const categories = [
  ["Brakes", 0, "Brake pads & discs"], ["Filters", 1, "Air, oil & cabin"], ["Batteries", 2, "Batteries & charging"], ["Engine", 3, "Plugs & engine parts"], ["Accessories", 4, "Wipers & essentials"], ["Fluids", 5, "Oils & lubricants"],
] as const;

export function HomePage() {
  const router = useRouter();
  const { vehicles, activeVehicleId, setActiveVehicleId, location } = usePartX();
  const [term, setTerm] = useState("");
  const activeVehicle = vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? vehicles[0];
  const go = () => router.push(`/shop${term.trim() ? `?q=${encodeURIComponent(term)}` : ""}`);

  return <>
    <section className="px-hero">
      <div className="px-container px-hero-grid">
        <div className="px-hero-copy">
          <div className="px-eyebrow">VEHICLE-VERIFIED AUTO PARTS</div>
          <h1>Find the exact part<br/>for your <span>vehicle.</span></h1>
          <p>Vehicle-verified parts from trusted stores, ready for pickup or delivery.</p>
          <div className="px-vehicle-finder">
            <label>Your vehicle<select value={activeVehicleId} onChange={(event) => setActiveVehicleId(event.target.value)}>{vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.variant}</option>)}</select></label>
            <label>Part or part number<input value={term} onChange={(event) => setTerm(event.target.value)} onKeyDown={(event) => event.key === "Enter" && go()} placeholder="e.g. brake pads, LX-3541"/></label>
            <button className="px-btn px-btn-red" onClick={go}>Find parts <Icon name="arrow"/></button>
          </div>
          <div className="px-hero-facts"><span><Icon name="check"/>Fitment checked</span><span><Icon name="pin"/>{location.label}: {location.address.split(",")[0]}</span><span><Icon name="offer"/>New-user offer</span></div>
        </div>
        <div className="px-hero-visual" aria-label={`${activeVehicle.make} ${activeVehicle.model} selected`}>
          <div className="px-hero-ring"/>
          <Image src="/vehicle-suv.png" alt="Black SUV" width={1200} height={720} priority />
          <div className="px-vehicle-chip"><span className="px-dot"/><b>{activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</b><small>{activeVehicle.variant} · {activeVehicle.fuel}</small></div>
        </div>
      </div>
    </section>

    <section className="px-section px-categories-section">
      <div className="px-container">
        <div className="px-section-head"><div><span>SHOP BY SYSTEM</span><h2>Popular categories</h2></div><Link href="/shop">View all parts <Icon name="arrow"/></Link></div>
        <div className="px-category-grid">{categories.map(([name, image, description]) => <Link href={`/shop?category=${name}`} className="px-category-card" key={name}><div><Image src={`/categories/${image}-v2.png`} alt="" width={360} height={260}/></div><b>{name}</b><span>{description}</span><Icon name="arrow"/></Link>)}</div>
      </div>
    </section>

    <section className="px-section">
      <div className="px-container">
        <div className="px-section-head"><div><span>SELECTED FOR YOUR GARAGE</span><h2>Recommended for your {activeVehicle.model}</h2></div><Link href="/shop">Shop all <Icon name="arrow"/></Link></div>
        <div className="px-product-grid">{getDemoCatalog().slice(0, 4).map((product) => <ProductCard product={product} key={product.id}/>)}</div>
      </div>
    </section>

    <section className="px-offer-band"><div className="px-container"><div><span>NEW CUSTOMER</span><h2>10% OFF YOUR FIRST ORDER</h2><p>Use code <b>WELCOME10</b> · Save up to ₹500</p></div><Link className="px-btn px-btn-white" href="/offers">Claim offer <Icon name="arrow"/></Link></div></section>

    <section className="px-trust"><div className="px-container"><div><Icon name="check"/><span><b>Fitment verified</b>Against your vehicle</span></div><div><Icon name="garage"/><span><b>Trusted sellers</b>Prices from local stores</span></div><div><Icon name="orders"/><span><b>Easy fulfilment</b>Delivery, pickup or garage</span></div><div><Icon name="headset"/><span><b>Order support</b>Help when you need it</span></div></div></section>
  </>;
}
