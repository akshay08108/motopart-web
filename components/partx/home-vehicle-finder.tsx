"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { Vehicle } from "@/lib/types";
import { matchesVehicle } from "@/lib/vehicle-fitment";
import { vehicleDetails, vehicleName } from "@/lib/vehicle-display";
import { usePartX } from "./app-provider";
import { VehiclePicker } from "./vehicle-picker";
import { Icon } from "./icons";
import styles from "./home-page.module.css";

export function HomeVehicleFinder() {
  const { vehicles, activeVehicleId, setActiveVehicleId, addVehicle, garageReady, catalog, isGuest } = usePartX();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const vehicle = garageReady ? vehicles.find((item) => item.id === activeVehicleId) ?? vehicles[0] : undefined;
  const count = vehicle ? catalog.filter((product) => matchesVehicle(product, vehicle)).length : 0;

  async function save(selection: Vehicle | string) {
    setSaving(true);
    setError("");
    try {
      if (typeof selection === "string") await setActiveVehicleId(selection);
      else await addVehicle(selection);
      setOpen(false);
    } catch {
      setError("Your vehicle could not be saved. Please try again.");
    } finally { setSaving(false); }
  }

  function chooseVehicle() { setError(""); setOpen(true); }

  return <>
    <aside className={styles.finder} aria-labelledby="home-vehicle-heading">
      <div className={styles.finderEyebrow}><Icon name="car"/><span>YOUR PARTX GARAGE</span><Link href="/garage">Manage</Link></div>
      <h2 id="home-vehicle-heading">{vehicle ? "Your car. Your parts." : "Find your fit."}</h2>
      <p className={styles.finderIntro}>{vehicle ? "A shortcut to the parts linked to your vehicle." : "Start with your model. Make every search more useful."}</p>
      {isGuest ? <Link href="/garage?add=vehicle" className={styles.finderAction}>Sign in to save a vehicle<Icon name="car"/></Link> : vehicle ? <>
        <div className={styles.selectedCar}>
          <span className={styles.selectedCarIcon}><Icon name="car"/></span>
          <div><small>SHOPPING FOR</small><strong>{vehicleName(vehicle)}</strong><span>{vehicleDetails(vehicle) || "Add year, fuel and variant in My garage"}</span></div>
          <button type="button" onClick={chooseVehicle} disabled={saving}>Change</button>
        </div>
        <div className={styles.finderMatch}><Icon name={count ? "check" : "info"}/><span>{count ? <><b>{count} {count === 1 ? "part" : "parts"}</b> linked to this model</> : "No matching parts listed for this model yet."}</span></div>
        <Link className={styles.finderAction} href={count ? "/shop?fitment=selected" : "/shop"}>{count ? "Shop matching parts" : "Browse all parts"}<Icon name="package"/></Link>
      </> : <>
        <button type="button" className={styles.finderChoose} onClick={chooseVehicle} disabled={!garageReady} aria-haspopup="dialog"><Icon name="car"/><span>{garageReady ? "Search make or model" : "Loading your garage…"}<small>Try Swift, Nexon or Creta</small></span><Icon name="plus"/></button>
        <button type="button" className={styles.finderAction} onClick={chooseVehicle} disabled={!garageReady}>Find my vehicle<Icon name="search"/></button>
      </>}
      <p className={styles.finderNote}><Icon name="info"/>Always confirm year, engine and variant before ordering.</p>
    </aside>
    {open && garageReady && createPortal(<VehiclePicker vehicles={vehicles} activeVehicleId={activeVehicleId} saving={saving} error={error} canClose onClose={() => { if (!saving) setOpen(false); }} onSave={(item) => void save(item)} onSelectSaved={save}/>, document.body)}
  </>;
}
