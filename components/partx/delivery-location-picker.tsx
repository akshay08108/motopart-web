"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { hasMapPin } from "@/lib/delivery-pricing";
import type { AppLocation } from "@/lib/types";
import { usePartX } from "./app-provider";

type Place = { id: string; place_name: string; center: [number, number] };
const apiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;

async function lookup(query: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ key: apiKey ?? "", language: "en" });
  if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(query)) params.set("limit", "5");
  const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params}`, { signal });
  if (!response.ok) throw new Error("Address search is unavailable. Please try again or enter your address below.");
  const data = await response.json();
  return (data.features ?? []).filter((place: Place) => typeof place.place_name === "string" && Array.isArray(place.center) && place.center.length === 2);
}

export function DeliveryLocationPicker({ close }: { close: () => void }) {
  const { location, setLocation } = usePartX();
  return <MapLocationPicker value={location} onSave={setLocation} close={close} saveLabel="Save delivery location"/>;
}

export function MapLocationPicker({ value: location, onSave: setLocation, close, title = "Where should we deliver?", saveLabel = "Use this location", requirePin = false }: { value:AppLocation; onSave:(location:AppLocation) => void | Promise<void>; close:() => void; title?:string; saveLabel?:string; requirePin?:boolean }) {
  const { latitude, longitude } = location;
  const hasSavedPin = hasMapPin(location);
  const [draft, setDraft] = useState<AppLocation>(location);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const mount = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const reverseRequest = useRef<AbortController | null>(null);
  const selectPin = useRef<(lat: number, lng: number) => void>(() => {});
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = oldOverflow; previous?.focus(); reverseRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    selectPin.current = (latitude, longitude) => {
      reverseRequest.current?.abort();
      const controller = new AbortController();
      reverseRequest.current = controller;
      setBusy(true); setError("");
      setDraft((current) => ({ ...current, latitude, longitude, address: "", placeId: undefined }));
      void lookup(`${longitude},${latitude}`, controller.signal).then((results) => {
        if (controller.signal.aborted) return;
        setDraft((current) => ({ ...current, address: results[0]?.place_name ?? "", placeId: results[0]?.id }));
        if (!results.length) setError("No street address was found here. Enter the full delivery address below.");
      }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    };
  }, []);

  useEffect(() => {
    if (!apiKey || !mount.current) return;
    let active = true;
    let instance: LeafletMap | undefined;
    void import("leaflet").then((L) => {
      if (!active || !mount.current) return;
      const center: [number, number] = hasSavedPin ? [latitude ?? 19.076, longitude ?? 72.8777] : [19.076, 72.8777];
      const currentMap = L.map(mount.current).setView(center, 14);
      instance = currentMap;
      map.current = currentMap;
      const tiles = L.tileLayer(`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`, {
        tileSize: 512, zoomOffset: -1, maxZoom: 20,
        attribution: '<a href="https://www.maptiler.com/copyright/">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
      }).addTo(currentMap);
      tiles.on("tileerror", () => { if (active) setError("Map tiles could not load. Check your connection or API key restrictions. You can still enter an address."); });
      marker.current = L.marker(center, { draggable: true, icon: L.divIcon({ className: "px-delivery-pin", html: "<span></span>", iconSize: [28, 36], iconAnchor: [14, 36] }) });
      if (hasSavedPin) marker.current.addTo(currentMap);
      marker.current.on("dragend", () => { const point = marker.current!.getLatLng(); selectPin.current(point.lat, point.lng); });
      currentMap.on("click", (event) => { marker.current?.setLatLng(event.latlng).addTo(currentMap); selectPin.current(event.latlng.lat, event.latlng.lng); });
    }).catch(() => setError("The map could not load. Please enter the full address below."));
    return () => { active = false; instance?.remove(); map.current = null; marker.current = null; };
  }, [latitude, longitude, hasSavedPin]);

  useEffect(() => {
    if (!apiKey || query.trim().length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true); setError("");
      void lookup(query.trim(), controller.signal).then((results) => {
        if (!controller.signal.aborted) { setPlaces(results); if (!results.length) setError("No matching addresses. Try an area, city or postcode."); }
      }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  function choose(place: Place) {
    reverseRequest.current?.abort();
    setDraft((current) => ({ ...current, address: place.place_name, placeId: place.id, longitude: place.center[0], latitude: place.center[1] }));
    if (map.current) marker.current?.setLatLng([place.center[1], place.center[0]]).addTo(map.current);
    map.current?.setView([place.center[1], place.center[0]], 16);
    setQuery(""); setPlaces([]); setError(""); setBusy(false);
  }

  function locate() {
    if (!navigator.geolocation) { setError("Location is unavailable in this browser. Search for your address instead."); return; }
    setBusy(true); setError("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (map.current) marker.current?.setLatLng([coords.latitude, coords.longitude]).addTo(map.current);
      map.current?.setView([coords.latitude, coords.longitude], 17);
      selectPin.current(coords.latitude, coords.longitude);
    }, () => { setBusy(false); setError("Location access failed. Allow location permission or search for your address."); }, { enableHighAccuracy: true, timeout: 12000 });
  }

  return <div className="px-delivery-overlay" onClick={close}><div className="px-delivery-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="delivery-location-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key === "Tab") {
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, a[href], [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}><header><div><small>{title === "Where should we deliver?" ? "DELIVERY ADDRESS" : "LOCATION"}</small><h2 id="delivery-location-title">{title}</h2></div><button type="button" aria-label="Close address picker" onClick={close} disabled={saving}>×</button></header>
    {apiKey ? <><label className="px-map-search">Search for an address<input value={query} onChange={(event) => { setQuery(event.target.value); setPlaces([]); }} placeholder="Area, street, city or postcode" autoComplete="off"/></label>{places.length ? <ul className="px-map-results">{places.map((place) => <li key={place.id}><button type="button" onClick={() => choose(place)}>{place.place_name}</button></li>)}</ul> : null}<button className="px-btn px-btn-outline" type="button" disabled={busy} onClick={locate}>Use my current location</button><div ref={mount} className="px-delivery-map" aria-label="Delivery map. Click to select a location or drag the pin."/><p className="px-form-note">{requirePin ? "Tap the map or drag the pin to your store entrance. Add the shop number and landmark below." : "Tap the map or drag the pin to your entrance. Add your flat number and landmark below."}</p></> : <p className="px-form-note">{requirePin ? "Map search is unavailable. Try again when the map is available." : "Map search is unavailable. You can still save your full delivery address."}</p>}
    {requirePin && !hasMapPin(draft) && <p className="px-form-note">Choose a search result, tap the map, or use your current location to place the pin before saving.</p>}
    {busy ? <p role="status">Finding address…</p> : null}{error ? <p className="px-checkout-error" role="alert">{error}</p> : null}
    <form className="px-form" onSubmit={async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (requirePin && !hasMapPin(draft)) { setError("Choose a point on the map before saving."); return; }
      setSaving(true); setError("");
      try { await setLocation({ ...draft, id: location.id || "default", label: draft.label.trim(), address: draft.address.trim() }); close(); }
      catch { setError("We could not save your address. Check your connection and try again."); }
      finally { setSaving(false); }
    }}><label>Address label<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Home or Work" required maxLength={50}/></label><label>{requirePin ? "Full store address" : "Full delivery address"}<textarea value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} required minLength={10} maxLength={500} placeholder="Flat / building, street, landmark, city and postcode"/></label><button className="px-btn px-btn-red" type="submit" disabled={busy || saving || (requirePin && !hasMapPin(draft))}>{saving ? "Saving…" : saveLabel}</button></form>
  </div></div>;
}
