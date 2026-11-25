"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import type { Vehicle } from "@/lib/types";
import { vehicleDetails, vehicleName } from "@/lib/vehicle-display";
import { Icon } from "./icons";
import { VehiclePhoto, VehiclePhotoCredit } from "./vehicle-photo";
import { vehiclePhoto } from "@/lib/vehicle-photo";
import styles from "./vehicle-picker.module.css";

type Model = { vehicleModelId: string; make: string; model: string; displayName: string };
type Guide = { fuelTypes: string[]; trimLadder: string };
type Props = {
  vehicles: Vehicle[];
  activeVehicleId: string;
  saving: boolean;
  error: string;
  canClose: boolean;
  onClose: () => void;
  onSave: (vehicle: Vehicle) => void;
  onSkip?: () => void;
  onSelectSaved: (id: string) => Promise<void>;
};
const fuels = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid", "LPG"];

export function VehiclePicker({ vehicles, activeVehicleId, saving, error, canClose, onClose, onSave, onSkip, onSelectSaved }: Props) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const [adding, setAdding] = useState(!vehicles.length);
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  const [make, setMake] = useState("");
  const [makes, setMakes] = useState<{ id: string; name: string }[]>([]);
  const [makesError, setMakesError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{ key: string; results: Model[]; error?: string } | null>(null);
  const [selected, setSelected] = useState<Model | null>(null);
  const [guideResponse, setGuideResponse] = useState<{ key: string; guide: Guide | null } | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [year, setYear] = useState("");
  const [fuel, setFuel] = useState("");
  const [variant, setVariant] = useState("");
  const [registration, setRegistration] = useState("");
  const canSearch = query.trim().length >= 2 || Boolean(make);
  const key = `${make}|${query.trim()}|${retry}`;
  const searching = canSearch && response?.key !== key;
  const results = !searching && response?.key === key ? response.results : [];
  const searchError = response?.key === key ? response.error : undefined;
  const showResults = expanded && canSearch && !searching && results.length > 0;
  const guide = guideResponse?.key === selected?.vehicleModelId ? guideResponse?.guide : null;
  const guideLoading = Boolean(selected && guideResponse?.key !== selected.vehicleModelId);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    function focusStep() {
      if (dialog.current?.closest("[inert]")) return;
      if (selected || manual) detailsHeading.current?.focus();
      else if (adding) search.current?.focus();
      else dialog.current?.focus();
    }
    focusStep();
    // The launch intro briefly makes the app inert on direct navigation.
    const observer = new MutationObserver(focusStep);
    if (dialog.current?.closest("[inert]")) observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["inert"] });
    return () => observer.disconnect();
  }, [selected, manual, adding]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/api/v1/vehicles/makes"), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (!controller.signal.aborted) { setMakes(body.data ?? []); setMakesError(false); }
      }).catch(() => { if (!controller.signal.aborted) setMakesError(true); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!adding || selected || manual || !canSearch) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (make) params.set("make", make);
        const res = await fetch(apiUrl(`/api/v1/vehicles/search?${params}`), { signal: controller.signal });
        if (!res.ok) throw new Error("Vehicle search could not load. Please try again.");
        const body = await res.json();
        if (!controller.signal.aborted) setResponse({ key, results: (body.data ?? []).slice(0, 8) });
      } catch {
        if (!controller.signal.aborted) setResponse({ key, results: [], error: "Vehicle search could not load. Please try again." });
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [adding, selected, manual, canSearch, query, make, key]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ make: selected.make, model: selected.model });
    fetch(apiUrl(`/api/v1/vehicles/variants?${params}`), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (!controller.signal.aborted) setGuideResponse({ key: selected.vehicleModelId, guide: body.data?.[0] ?? null });
      }).catch(() => {
        if (!controller.signal.aborted) setGuideResponse({ key: selected.vehicleModelId, guide: null });
      });
    return () => controller.abort();
  }, [selected]);

  function choose(model: Model) {
    setSelected(model);
    setYear(""); setFuel(""); setVariant(""); setRegistration("");
    setExpanded(false); setActiveIndex(-1);
  }
  function resetDetails() {
    setSelected(null); setManual(false);
    setYear(""); setFuel(""); setVariant(""); setRegistration("");
    setExpanded(true); setActiveIndex(-1);
  }
  const inDetails = Boolean(selected || manual);

  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && canClose && !saving) onClose(); }}>
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (showResults) { setExpanded(false); setActiveIndex(-1); }
          else if (canClose && !saving) onClose();
        }
        if (event.key !== "Tab") return;
        const focusable = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]');
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>YOUR PARTX GARAGE</span><h2 id={`${id}-title`}>{inDetails ? "Make it yours" : "Find your vehicle"}</h2><p>{inDetails ? "A few optional details to describe your car." : "Start with a model. We’ll help with the rest."}</p></div>
        {canClose && <button type="button" className={styles.iconButton} onClick={onClose} disabled={saving} aria-label="Close vehicle search"><Icon name="close"/></button>}
      </header>
      <div className={styles.body}>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {!inDetails && <>
          {vehicles.length > 0 && !adding ? <section aria-label="Saved vehicles">
            <div className={styles.sectionLabel}>YOUR SAVED VEHICLES</div>
            <div className={styles.saved}>{vehicles.map((vehicle) => <button type="button" disabled={saving} key={vehicle.id} onClick={() => void onSelectSaved(vehicle.id)}>
              <span className={styles.vehicleIcon}><Icon name="car"/></span><span><strong>{vehicleName(vehicle)}</strong><small>{vehicleDetails(vehicle)}</small></span><span className={styles.active}>{activeVehicleId === vehicle.id ? "Active" : <Icon name="chevron"/>}</span>
            </button>)}</div>
            <button type="button" className={`px-btn px-btn-red ${styles.wide}`} onClick={() => setAdding(true)} disabled={saving}><Icon name="plus"/>Add another vehicle</button>
          </section> : <>
            {vehicles.length > 0 && <button type="button" className={styles.textButton} onClick={() => setAdding(false)}><Icon name="arrow"/>Your saved vehicles</button>}
            <div className={styles.steps} aria-label="Step 1 of 2"><b>1 · Find model</b><span>2 · Add details</span></div>
            <label className={styles.label} htmlFor={`${id}-search`}>Search your model</label>
            <div className={styles.searchBox}>
              <Icon name="search"/>
              <input ref={search} id={`${id}-search`} role="combobox" aria-autocomplete="list" aria-expanded={Boolean(showResults)} aria-controls={`${id}-results`} aria-activedescendant={showResults && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined} autoComplete="off" value={query} disabled={saving}
                onChange={(event) => { setQuery(event.target.value); setExpanded(true); setActiveIndex(-1); }}
                onFocus={() => setExpanded(true)} placeholder="Try Swift, Creta or VW Polo"
                onKeyDown={(event) => {
                  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
                    event.preventDefault(); setExpanded(true);
                    const next = event.key === "ArrowDown" ? (activeIndex + 1) % results.length : (activeIndex <= 0 ? results.length - 1 : activeIndex - 1);
                    setActiveIndex(next);
                    document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: "nearest" });
                  }
                  if (event.key === "Enter" && showResults && activeIndex >= 0) { event.preventDefault(); choose(results[activeIndex]); }
                }}/>
              {query && <button type="button" className={styles.iconButton} aria-label="Clear vehicle search" onClick={() => { setQuery(""); setActiveIndex(-1); setExpanded(true); search.current?.focus(); }}><Icon name="close"/></button>}
            </div>
            <label className={styles.makeFilter}>Manufacturer<select value={make} onChange={(event) => { setMake(event.target.value); setActiveIndex(-1); setExpanded(true); }}><option value="">All manufacturers</option>{makes.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
            {makesError && <p className={styles.hint}>Manufacturer filters couldn’t load. You can still search by model. <button type="button" className={styles.inlineButton} onClick={() => setRetry((value) => value + 1)}>Retry filters</button></p>}
            <div role="status" aria-live="polite" className={styles.status}>{searching ? "Finding matching models…" : searchError ? "Search unavailable" : canSearch ? `${results.length} matching ${results.length === 1 ? "model" : "models"}` : "Type at least two letters, or choose a manufacturer."}</div>
            {searchError ? <div className={styles.error}><p>{searchError}</p><button type="button" className={styles.inlineButton} onClick={() => setRetry((value) => value + 1)}>Try again</button></div> : null}
            <div id={`${id}-results`} role="listbox" aria-label="Matching vehicle models" className={styles.results}>
              {showResults ? results.map((car, index) => <div role="option" aria-selected={activeIndex === index} id={`${id}-option-${index}`} key={car.vehicleModelId} className={activeIndex === index ? styles.highlighted : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(car)}>
                <span className={styles.vehicleIcon}><Icon name="car"/></span><span><strong><Highlighted text={car.model} query={query}/></strong><small><Highlighted text={car.make} query={query}/></small></span><Icon name="chevron"/>
              </div>) : null}
            </div>
            {canSearch && !searching && !searchError && !results.length && <div className={styles.empty}><Icon name="search"/><h3>No matching models</h3><p>Try another spelling or manufacturer, or enter your vehicle manually.</p></div>}
            <button type="button" className={styles.textButton} onClick={() => { resetDetails(); setManual(true); }} disabled={saving}>Can’t find your car? Enter it manually <Icon name="arrow"/></button>
          </>}
        </>}
        {inDetails && <>
          <button type="button" className={styles.textButton} onClick={resetDetails} disabled={saving}><Icon name="arrow"/>Back to models</button>
          <div className={styles.steps} aria-label="Step 2 of 2"><span>1 · Find model</span><b>2 · Add details</b></div>
          <div className={styles.selected}><span className={styles.vehicleIcon}><Icon name="car"/></span><div><span className={styles.sectionLabel}>{manual ? "MANUAL ENTRY" : selected?.make}</span><h3 ref={detailsHeading} tabIndex={-1}>{selected?.model ?? "Your vehicle"}</h3></div><Icon name="check"/></div>
          {selected && <div className={styles.modelPhoto}><VehiclePhoto vehicle={selected}/>{vehiclePhoto(selected) && <VehiclePhotoCredit photo={vehiclePhoto(selected)!}/>}</div>}
          <form className={styles.form} onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const vehicleMake = selected?.make ?? String(data.get("make") ?? "").trim();
            const model = selected?.model ?? String(data.get("model") ?? "").trim();
            if (!vehicleMake || !model) return;
            onSave({ id: crypto.randomUUID(), vehicleModelId: selected?.vehicleModelId, make: vehicleMake, model,
              year: year ? Number(year) : undefined, fuel: fuel || undefined, variant: variant.trim() || undefined, registration: registration.trim() || undefined });
          }}>
            {manual && <><label>Manufacturer<input name="make" required maxLength={60} placeholder="e.g. Maruti Suzuki" disabled={saving}/></label><label>Model<input name="model" required maxLength={60} placeholder="e.g. Swift" disabled={saving}/></label></>}
            <label>Model year <span>Optional</span><input type="number" inputMode="numeric" min={1886} max={new Date().getFullYear() + 1} step={1} value={year} onChange={(event) => setYear(event.target.value)} placeholder="e.g. 2020" disabled={saving}/></label>
            <label>Fuel type <span>Optional</span><select value={fuel} onChange={(event) => setFuel(event.target.value)} disabled={saving}><option value="">I’m not sure / Add later</option>{guide?.fuelTypes.length ? <><optgroup label="From model guide">{guide.fuelTypes.map((item) => <option key={item}>{item}</option>)}</optgroup><optgroup label="Other fuel — check your RC">{fuels.filter((item) => !guide.fuelTypes.includes(item)).map((item) => <option key={item}>{item}</option>)}</optgroup></> : fuels.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Variant / trim <span>Optional</span><input value={variant} onChange={(event) => setVariant(event.target.value)} maxLength={60} placeholder="e.g. VXi · from your RC" disabled={saving}/></label>
            <label>Registration number <span>Optional</span><input value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} maxLength={20} autoCapitalize="characters" placeholder="e.g. TS 09 AB 1234" disabled={saving}/></label>
            <div className={styles.guidance}>
              {guideLoading ? <p role="status">Loading fuel and trim guidance…</p> : guide ? <><b>Catalogue guidance</b><p>{guide.fuelTypes.join(" · ")}</p><p>{guide.trimLadder}</p></> : <p>No detailed guide for this model yet. Use your RC, or leave details blank.</p>}
              <p>Details describe your vehicle. Exact part fitment still needs to be checked.</p>
            </div>
            <button type="submit" className={`px-btn px-btn-red ${styles.wide}`} disabled={saving}>{saving ? "Saving vehicle…" : "Save vehicle"}<Icon name="arrow"/></button>
            {!manual && <button type="button" className={styles.skipDetails} disabled={saving} onClick={() => onSave({ id: crypto.randomUUID(), vehicleModelId: selected!.vehicleModelId, make: selected!.make, model: selected!.model })}>I’m not sure — save model only</button>}
          </form>
        </>}
        {onSkip && !inDetails && <button type="button" className={styles.skipDetails} disabled={saving} onClick={onSkip}>Add my vehicle later</button>}
      </div>
    </div>
  </div>;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.join("|")})`, "ig");
  return text.split(pattern).map((part, index) => <Fragment key={index}>{index % 2 ? <mark>{part}</mark> : part}</Fragment>);
}
