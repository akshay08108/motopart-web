"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { categoryHref, categoryPhotos } from "@/lib/part-categories";
import { vehicleName } from "@/lib/vehicle-display";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { PartSearch } from "./part-search";
import { DeliveryLocationButton } from "./delivery-location-button";
import { HomeVehicleFinder } from "./home-vehicle-finder";
import { matchesVehicle } from "@/lib/vehicle-fitment";
import styles from "./home-page.module.css";

const categories = [
  { name: "Brakes", image: categoryPhotos.brakes, description: "Pads, discs & calipers", href: categoryHref("brakes") },
  { name: "Filters", image: categoryPhotos.filters, description: "Air, oil & cabin filters", href: categoryHref("filters") },
  { name: "Batteries", image: categoryPhotos.batteries, description: "Starting & charging", href: categoryHref("electrical", "batteries") },
  { name: "Electrical & lighting", image: categoryPhotos.electrical, description: "Headlamps, bulbs & electrics", href: categoryHref("electrical") },
  { name: "Suspension", image: categoryPhotos.suspension, description: "Struts, shocks & springs", href: categoryHref("suspension") },
  { name: "Engine", image: categoryPhotos.engine, description: "Engine & service parts", href: categoryHref("engine") },
  { name: "Ignition", image: categoryPhotos.ignition, description: "Spark plugs, coils & leads", href: categoryHref("engine", "ignition") },
  { name: "Wipers", image: categoryPhotos.body, description: "Blades, arms & washers", href: categoryHref("body", "wipers") },
  { name: "Fluids", image: categoryPhotos.fluids, description: "Coolant, power steering fluid & DEF", href: categoryHref("fluids") },
  { name: "Oil filters", image: categoryPhotos.oilFilters, description: "Spin-on & cartridge filters", href: categoryHref("filters", "oil-filters") },
] as const;

export function HomePage() {
  const { vehicles, activeVehicleId, setActiveVehicleId, catalog, user } = usePartX();
  const [vehicleError, setVehicleError] = useState("");
  const activeVehicle = vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? vehicles[0];
  const compatibleParts = catalog.filter((product) => matchesVehicle(product, activeVehicle));
  const shownParts = (compatibleParts.length ? compatibleParts : catalog).slice(0, 5);

  return <div className={styles.home}>
    <section className={`px-container ${styles.hero}`} aria-labelledby="storefront-heading">
      <div className={styles.heroMain}>
        <div className={styles.heroArt} aria-hidden="true">
          <span className={styles.heroGear}/>
          <svg className={styles.heroWrench} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z"/>
          </svg>
          <svg className={styles.heroBrakePads} viewBox="0 0 80 56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="M9 17Q40-3 71 17l-4 18q-27-15-54 0Z"/>
            <path d="m9 22-6 2 3 10 7-2m58-10 6 2-3 10-7-2M29 9l-2 17m24-17 2 17M15 41q25-13 50 0l-3 10q-22-10-44 0Z"/>
            <circle cx="20" cy="20" r="2"/><circle cx="60" cy="20" r="2"/>
          </svg>
          <svg className={styles.heroSuspension} viewBox="0 0 56 100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <circle cx="28" cy="8" r="5"/><circle cx="28" cy="92" r="5"/>
            <path d="M28 13v11m0 52v11M20 24h16v52H20ZM16 25l24 9-24 9 24 9-24 9 24 9M16 76h24M16 22h24"/>
          </svg>
          <svg className={styles.heroFilter} viewBox="0 0 60 70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="M12 15q18-9 36 0v42q-18 12-36 0ZM12 15q18 12 36 0M12 23q18 12 36 0M20 32v20m10-17v20m10-23v20"/>
          </svg>
          <svg className={styles.heroSparkPlug} viewBox="0 0 40 100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="M16 4h8v12h-8ZM14 16h12v33H14ZM12 23h16M12 30h16M12 37h16M12 44h16M11 49h18l5 10-5 9H11L6 59ZM14 68h12v19H14ZM12 73h16M12 79h16M12 85h16M20 87v6m6-6v9h-6"/>
          </svg>
        </div>
        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>THE RIGHT PART STARTS HERE</span>
          <h1 id="storefront-heading">Your next part,<br/><em>right here.</em></h1>
          <p>Find what fits. Compare local stores. Get back on the road.</p>
          <PartSearch className={styles.search} label="Find a part" placeholder="Search a part, brand or part number"/>
          <div className={styles.quickSearches} aria-label="Quick part searches">
            <Link href="/shop?q=brake%20pads">Brake pads<Icon name="arrow"/></Link>
            <Link href="/shop?q=air%20filter">Air filters<Icon name="arrow"/></Link>
            <Link href="/shop?q=engine%20oil">Engine oil<Icon name="arrow"/></Link>
          </div>
        </div>
        <HomeVehicleFinder key={user?.id ?? "guest"}/>
      </div>

      <div className={styles.shortcuts}>
        <div className={styles.shortcut}>
          <Icon name="car"/>
          <div>
            {vehicles.length ? <label className={styles.vehicleSelect}>
              <span>Your vehicle</span>
              <select value={activeVehicle?.id ?? ""} onChange={(event) => {
                setVehicleError("");
                void setActiveVehicleId(event.target.value).catch(() => setVehicleError("Could not change your vehicle. Try again."));
              }}>
                {vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicleName(vehicle)}{vehicle.variant ? ` · ${vehicle.variant}` : ""}</option>)}
              </select>
            </label> : <Link href="/garage?add=vehicle">
              <span>Vehicle fitment</span>
              <strong>Add your vehicle</strong>
            </Link>}
          </div>
        </div>
        <div className={styles.shortcut}>
          <Icon name="pin"/>
          <div>
            <span>Deliver to</span>
            <DeliveryLocationButton className={styles.location}/>
          </div>
        </div>
        <Link href="/shop?view=stores" className={styles.shortcut}>
          <Icon name="store"/>
          <div><span>Local sellers</span><strong>Shop by store</strong></div>
          <Icon name="arrow" className={styles.shortcutArrow}/>
        </Link>
      </div>
      {vehicleError && <p className={styles.vehicleError} role="alert">{vehicleError}</p>}
    </section>

    <section className={`px-container ${styles.section}`} aria-labelledby="storefront-categories">
      <div className={styles.sectionHeading}>
        <h2 id="storefront-categories">Shop by category</h2>
        <Link href="/shop">All categories <Icon name="arrow"/></Link>
      </div>
      <div className={styles.categories}>
        {categories.map((category) => <Link href={category.href} className={styles.category} key={category.name}>
          <Image className={styles.categoryPhoto} src={category.image} alt="" width={160} height={160} unoptimized/>
          <div className={styles.categoryText}>
            <strong>{category.name}</strong>
            <small>{category.description}</small>
          </div>
        </Link>)}
      </div>
    </section>

    <section className={`px-container ${styles.section} ${styles.parts}`} aria-labelledby="storefront-parts">
      <div className={styles.sectionHeading}>
        <h2 id="storefront-parts">{activeVehicle && compatibleParts.length ? `Parts for your ${activeVehicle.model}` : "Browse parts"}</h2>
        <Link href={compatibleParts.length ? "/shop?fitment=selected" : "/shop"}>Shop all <Icon name="arrow"/></Link>
      </div>
      <div className="px-product-grid">{shownParts.map((product) => <ProductCard product={product} key={product.id}/>)}</div>
    </section>
  </div>;
}
