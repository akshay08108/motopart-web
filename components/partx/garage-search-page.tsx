"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Garage, Vehicle } from "@/lib/types";
import { vehicleDetails, vehicleName } from "@/lib/vehicle-display";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import styles from "./garage-search-page.module.css";
import { apiUrl } from "@/lib/api-url";
import { DeliveryLocationPicker } from "./delivery-location-picker";
import { LocationPicker } from "../location-picker";
import type { AppLocation } from "@/lib/types";

type SearchResult = {
  vehicleModelId: string;
  make: string;
  model: string;
  displayName: string;
};

type VariantGuide = {
  vehicleModelId: string;
  fuelTypes: string[];
  trimLadder: string;
};


export function GarageSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { vehicles, activeVehicleId, setActiveVehicleId, addVehicle, location, garages, addGarage, needsVehicle, skipVehicleSetup } = usePartX();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [manual, setManual] = useState(false);
  const [vehicleDialog, setVehicleOpen] = useState(searchParams.get("add") === "vehicle");
  const vehicleOpen = vehicleDialog || needsVehicle;
  const [garageOpen, setGarageOpen] = useState(false);
  const [garageLocation,setGarageLocation] = useState<AppLocation>({ id:"garage-draft", label:"Garage", address:"" });
  const [locationOpen, setLocationOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [make, setMake] = useState("");
  const [makes, setMakes] = useState<Array<{ id: string; name: string }>>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [variantGuide, setVariantGuide] = useState<VariantGuide | null>(null);
  const [variantLoading, setVariantLoading] = useState(false);
  const [fuel, setFuel] = useState("");
  const [variant, setVariant] = useState("");
  const [registration, setRegistration] = useState("");

  const canSearch = query.trim().length >= 2 || Boolean(make);

  useEffect(() => {
    if (!vehicleOpen || makes.length) return;
    const controller = new AbortController();
    fetch(apiUrl("/api/v1/vehicles/makes"), { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { data?: Array<{ id: string; name: string }>; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Vehicle makes could not be loaded.");
        setMakes(body.data ?? []);
        setSearchError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : "Vehicle makes could not be loaded.");
      });
    return () => controller.abort();
  }, [makes.length, retryKey, vehicleOpen]);

  useEffect(() => {
    if (!vehicleOpen || !canSearch) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (make) params.set("make", make);
        const response = await fetch(apiUrl(`/api/v1/vehicles/search?${params}`), { signal: controller.signal });
        const body = await response.json() as { data?: SearchResult[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Vehicle search failed.");
        setResults(body.data ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setResults([]);
        setSearchError(error instanceof Error ? error.message : "Vehicle search failed.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, make, query, retryKey, vehicleOpen]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ make: selected.make, model: selected.model });
    fetch(apiUrl(`/api/v1/vehicles/variants?${params}`), { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { data?: VariantGuide[] };
        if (!response.ok) throw new Error("Variant information could not be loaded.");
        setVariantGuide(body.data?.[0] ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setVariantGuide(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setVariantLoading(false);
      });
    return () => controller.abort();
  }, [selected]);

  const activeVehicle = useMemo(() => vehicles.find((vehicle) => vehicle.id === activeVehicleId), [activeVehicleId, vehicles]);

  const resetVehicleDialog = () => {
    setVehicleOpen(false);
    if (searchParams.has("add")) router.replace("/garage");
    setManual(false);
    setSaveError("");
    setQuery("");
    setMake("");
    setResults([]);
    setSelected(null);
    setVariantGuide(null);
    setFuel("");
    setVariant("");
    setRegistration("");
    setSearchError("");
  };

  const saveVehicle = async (vehicle?: Vehicle) => {
    setSaving(true);
    setSaveError("");
    try {
      if (vehicle) await addVehicle(vehicle);
      else await skipVehicleSetup();
      resetVehicleDialog();
      if (needsVehicle) router.replace("/");
    } catch {
      setSaveError("Could not save your vehicle settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const addSelectedVehicle = () => {
    if (!selected) return;
    void saveVehicle({
      id: crypto.randomUUID(),
      vehicleModelId: selected.vehicleModelId,
      make: selected.make,
      model: selected.model,
      variant: variant.trim() || undefined,
      fuel: fuel || undefined,
      registration: registration.trim() || undefined,
    });
  };

  const saveGarage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const garage: Garage = {
      id: `garage-${Date.now()}`,
      name: String(data.get("name")),
      phone: String(data.get("phone")),
      services: String(data.get("services")),
      distanceKm: 0,
      location: { ...garageLocation, id: `garage-location-${Date.now()}`, label: "Garage", address: String(data.get("address")) },
    };
    setSaving(true);
    setSaveError("");
    try {
      await addGarage(garage);
      setGarageLocation({ id: "garage-draft", label: "Garage", address: "" });
      setGarageOpen(false);
    } catch {
      setSaveError("Could not save this garage. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="px-page px-container">
    <div className="px-page-heading-row">
      <div className="px-page-title"><span>FITMENT PROFILE</span><h1>My garage</h1><p>Search your exact car, save it once, and shop parts that match it.</p></div>
      <button className="px-btn px-btn-red" onClick={() => setVehicleOpen(true)}><Icon name="plus"/>Add vehicle</button>
    </div>

    {activeVehicle ? <section className={styles.activeHero}>
      <div className={styles.activeImage}><Image src="/vehicle-suv.png" alt="" width={360} height={200}/></div>
      <div><span>ACTIVE VEHICLE</span><h2>{vehicleName(activeVehicle)}</h2><p>{vehicleDetails(activeVehicle)}</p>{activeVehicle.registration ? <small>{activeVehicle.registration}</small> : null}</div>
      <Link className="px-btn px-btn-dark" href="/shop">Shop compatible parts <Icon name="arrow"/></Link>
    </section> : null}

    <div className="px-dashboard-grid">
      <section className="px-panel px-panel-wide"><div className="px-panel-head"><div><span>MY VEHICLES</span><h2>{vehicles.length ? "Select your active vehicle" : "Select your vehicle"}</h2></div></div>
        {!vehicles.length ? <p>Your garage is empty. Add a vehicle to shop for compatible parts.</p> : null}
        {!vehicleOpen && !garageOpen && saveError && <p role="alert">{saveError}</p>}
        <div className="px-vehicle-list">{vehicles.map((vehicle) => <button className={activeVehicleId === vehicle.id ? "active" : ""} onClick={() => void setActiveVehicleId(vehicle.id).catch(() => setSaveError("Could not change your active vehicle. Try again."))} key={vehicle.id}><Image src="/vehicle-suv.png" alt="" width={220} height={120}/><div><b>{vehicleName(vehicle)}</b><span>{vehicleDetails(vehicle)}</span><small>{vehicle.registration}</small></div>{activeVehicleId === vehicle.id ? <em><Icon name="check"/>Active</em> : null}</button>)}</div>
      </section>
      <section className="px-panel"><div className="px-panel-head"><div><span>DELIVERY LOCATION</span><h2>{location.label}</h2></div><button onClick={() => setLocationOpen(true)}>Edit</button></div><p className="px-address"><Icon name="pin"/>{location.address}</p></section>
      <section className="px-panel"><div className="px-panel-head"><div><span>TRUSTED GARAGES</span><h2>{garages.length} saved</h2></div><button onClick={() => setGarageOpen(true)}>Add</button></div>{garages.map((garage) => <div className="px-garage-row" key={garage.id}><div className="px-square-icon"><Icon name="garage"/></div><div><b>{garage.name}</b><span>{garage.services}</span><small>{garage.location.address}</small></div></div>)}</section>
    </div>

    {vehicleOpen ? <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (!needsVehicle && !saving && event.target === event.currentTarget) resetVehicleDialog(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="vehicle-search-title">
        <header className={styles.dialogHeader}><div><span>PARTX VEHICLE FINDER</span><h2 id="vehicle-search-title">Select your vehicle</h2><p>Search by make or model.</p></div>{!needsVehicle && <button onClick={resetVehicleDialog} disabled={saving} aria-label="Close vehicle search"><Icon name="close"/></button>}</header>
        <div className={styles.searchBody}>
          {saveError && <p role="alert">{saveError}</p>}
          <div className="px-garage-setup-actions">
            <button className="px-btn px-btn-outline" type="button" disabled={saving} onClick={() => setManual((value) => !value)}>{manual ? "Search the catalog" : "Enter vehicle manually"}</button>
            {needsVehicle && <button className="px-link-button" type="button" disabled={saving} onClick={() => void saveVehicle()}>Add later</button>}
          </div>
          {manual ? <form className="px-form" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const make = String(data.get("make") ?? "").trim();
            const model = String(data.get("model") ?? "").trim();
            if (!make || !model) { setSaveError("Enter the make and model of your vehicle."); return; }
            void saveVehicle({ id: crypto.randomUUID(), make, model, fuel: String(data.get("fuel") ?? ""), variant: String(data.get("variant") ?? "").trim() });
          }}>
            <label>Make<input name="make" required maxLength={60}/></label>
            <label>Model<input name="model" required maxLength={60}/></label>
            <label>Fuel type<select name="fuel"><option value="">Choose fuel type</option><option>Petrol</option><option>Diesel</option><option>Electric</option><option>Hybrid</option><option>CNG</option><option>LPG</option></select></label>
            <label>Variant / trim<input name="variant" maxLength={60}/></label>
            <button type="submit" className="px-btn px-btn-red" disabled={saving}>Add to My Garage</button>
          </form> : <>
          <label className={styles.searchBox}><Icon name="search"/><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setSelected(null); setVariantGuide(null); }} placeholder="Search model, e.g. Swift, Creta, Thar"/><span>{searching ? "Searching…" : ""}</span></label>
          <div className={styles.filters}><label>Make<select value={make} onChange={(event) => { setMake(event.target.value); setSelected(null); setVariantGuide(null); }}><option value="">Any make</option>{makes.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select></label></div>


          {searchError ? <div className={styles.error}><Icon name="close"/><p>{searchError}</p><button type="button" onClick={() => setRetryKey((current) => current + 1)}>Try again</button></div> : null}
          {!canSearch ? <p className={styles.searchHint}>Type at least two letters to see matching vehicles.</p> : null}
          {canSearch && !searching && !searchError && !results.length ? <div className={styles.searchHint}><Icon name="garage"/><h3>No matching cars found</h3><p>Try a different model spelling, make, or year.</p></div> : null}

          {canSearch && results.length ? <div className={styles.results}>{results.map((car) => <button type="button" className={selected?.vehicleModelId === car.vehicleModelId ? styles.resultSelected : ""} key={car.vehicleModelId} onClick={() => { setSelected(car); setVariantGuide(null); setVariantLoading(true); setFuel(""); setVariant(""); }}><span className={styles.suggestionName}>{car.displayName}</span><i>{selected?.vehicleModelId === car.vehicleModelId ? <Icon name="check"/> : <Icon name="chevron"/>}</i></button>)}</div> : null}

          {selected ? <section className={styles.confirm}>
            <div className={styles.selectedVehicle}><span>SELECTED VEHICLE</span><h3>{selected.displayName}</h3><p>{variantGuide?.trimLadder ?? (variantLoading ? "Loading available fuel and trim guidance…" : "No variant guide is available for this model.")}</p></div>
            {variantGuide?.fuelTypes.length ? <label>Fuel type<select value={fuel} onChange={(event) => setFuel(event.target.value)}><option value="">Not specified</option>{variantGuide.fuelTypes.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
            <label>Variant / trim<input value={variant} onChange={(event) => setVariant(event.target.value)} placeholder="Optional · enter from your RC"/></label>
            <label>Registration number <input value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} placeholder="Optional · TS 09 AB 1234"/></label>
            <button className="px-btn px-btn-red" disabled={saving} onClick={addSelectedVehicle}>Add to My Garage <Icon name="arrow"/></button>
          </section> : null}
          </>}
        </div>
      </div>
    </div> : null}

    {garageOpen ? <SimpleModal title="Add a trusted garage" close={() => setGarageOpen(false)}><form className="px-form" onSubmit={(event) => void saveGarage(event)}><label>Garage name<input name="name" required/></label><label>Phone<input name="phone" required/></label><label>Services<input name="services" placeholder="Installation, diagnostics" required/></label><LocationPicker value={garageLocation} onSelect={setGarageLocation} label="Garage address"/>{saveError && <p role="alert">{saveError}</p>}<button className="px-btn px-btn-red" type="submit" disabled={saving}>{saving ? "Saving…" : "Save garage"}</button></form></SimpleModal> : null}
    {locationOpen ? <DeliveryLocationPicker close={() => setLocationOpen(false)}/> : null}
  </div>;
}

function SimpleModal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className={`${styles.dialog} ${styles.simpleDialog}`} role="dialog" aria-modal="true"><header className={styles.dialogHeader}><h2>{title}</h2><button onClick={close} aria-label={`Close ${title}`}><Icon name="close"/></button></header><div className={styles.simpleBody}>{children}</div></div></div>;
}
