"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { vehicleName } from "@/lib/vehicle-display";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { PartSearch } from "./part-search";
import { DeliveryLocationButton } from "./delivery-location-button";
import styles from "./home-page.module.css";

const categories = [
  { name: "Brakes", image: "/categories/0-v2.png", description: "Pads, discs & calipers", href: "/shop?category=Brakes" },
  { name: "Filters", image: "/categories/1-v2.png", description: "Air, oil & cabin filters", href: "/shop?category=Filters" },
  { name: "Batteries", image: "/categories/2-v2.png", description: "Starting & charging", href: "/shop?category=Batteries" },
  { name: "Electrical & lighting", image: "/categories/3-v2.png", description: "Headlamps, bulbs & electrics", href: "/shop?category=Electrical" },
  { name: "Suspension", image: "/categories/4-v2.png", description: "Struts, shocks & springs", href: "/shop?category=Suspension" },
  { name: "Engine", image: "/categories/5-v2.png", description: "Engine & service parts", href: "/shop?category=Engine" },
  { name: "Ignition", image: "/parts/3-v2.png", description: "Spark plugs, coils & leads", href: "/shop?q=spark%20plug" },
  { name: "Wipers", image: "/parts/4-v2.png", description: "Blades, arms & washers", href: "/shop?q=wiper" },
  { name: "Fluids", image: "/categories/fluids.webp", description: "Coolant, power steering fluid & DEF", href: "/shop?category=Fluids" },
  { name: "Oil filters", image: "/parts/5-v2.png", description: "Spin-on & cartridge filters", href: "/shop?q=oil%20filter" },
] as const;

export function HomePage() {
  const { vehicles, activeVehicleId, setActiveVehicleId, catalog } = usePartX();
  const [vehicleError, setVehicleError] = useState("");
  const activeVehicle = vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? vehicles[0];
  const compatibleParts = activeVehicle ? catalog.filter((product) =>
    product.compatibleVehicleIds.includes(activeVehicle.id)
    || Boolean(activeVehicle.vehicleModelId && product.compatibleVehicleIds.includes(activeVehicle.vehicleModelId))) : [];
  const shownParts = (compatibleParts.length ? compatibleParts : catalog).slice(0, 5);

  return <div className={styles.home}>
    <section className={`px-container ${styles.hero}`} aria-labelledby="storefront-heading">
      <div className={styles.heroMain}>
        <div className={styles.heroCopy}>
          <h1 id="storefront-heading">Your next part,<br/><em>right here.</em></h1>
          <p>Find what fits. Compare local stores. Get back on the road.</p>
          <PartSearch className={styles.search} label="Find a part" placeholder="Search a part, brand or part number"/>
          <div className={styles.quickSearches} aria-label="Quick part searches">
            <Link href="/shop?q=brake%20pads">Brake pads<Icon name="arrow"/></Link>
            <Link href="/shop?q=air%20filter">Air filters<Icon name="arrow"/></Link>
            <Link href="/shop?q=engine%20oil">Engine oil<Icon name="arrow"/></Link>
          </div>
        </div>
      </div>

      <div className={styles.shortcuts}>
        <div className={styles.shortcut}>
          <Icon name="garage"/>
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
        <Link href="/shop">All parts <Icon name="arrow"/></Link>
      </div>
      <div className={styles.categories}>
        {categories.map((category) => <Link href={category.href} className={styles.category} key={category.name}>
          <div className={styles.categoryImage}>
            <Image src={category.image} alt="" width={96} height={96} sizes="80px"/>
          </div>
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
        <Link href="/shop">Shop all <Icon name="arrow"/></Link>
      </div>
      <div className="px-product-grid">{shownParts.map((product) => <ProductCard product={product} key={product.id}/>)}</div>
    </section>
  </div>;
}
