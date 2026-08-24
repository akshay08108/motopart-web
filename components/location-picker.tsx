"use client";

import { useEffect, useRef, useState } from "react";
import type { AppLocation } from "@/lib/types";

type GooglePlace = {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: { lat(): number; lng(): number };
  fetchFields(input: { fields: string[] }): Promise<void>;
};

type GoogleMapsApi = {
  importLibrary(name: string): Promise<{ PlaceAutocompleteElement: new (options: { includedRegionCodes: string[] }) => HTMLElement }>;
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
    [key: `initMotoPartMaps_${string}`]: (() => void) | undefined;
  }
}

let mapsPromise: Promise<GoogleMapsApi> | undefined;

function loadMaps(key: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const callback = `initMotoPartMaps_${Date.now()}` as const;
    window[callback] = () => {
      delete window[callback];
      if (window.google?.maps) resolve(window.google.maps);
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&libraries=places&callback=${callback}`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps could not load"));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export function LocationPicker({ value, onSelect, label = "Find this place on Google Maps" }: { value: AppLocation; onSelect: (location: AppLocation) => void; label?: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const [manualAddress, setManualAddress] = useState(value.address);
  const [error, setError] = useState("");
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!key || !mount.current) return;
    let element: HTMLElement | undefined;
    let active = true;
    loadMaps(key).then(async (maps) => {
      const { PlaceAutocompleteElement } = await maps.importLibrary("places");
      if (!active || !mount.current) return;
      element = new PlaceAutocompleteElement({ includedRegionCodes: ["in"] });
      element.setAttribute("aria-label", label);
      mount.current.replaceChildren(element);
      element.addEventListener("gmp-select", async (event) => {
        const prediction = (event as CustomEvent<{ placePrediction: { toPlace(): GooglePlace } }>).detail?.placePrediction ?? (event as unknown as { placePrediction: { toPlace(): GooglePlace } }).placePrediction;
        const place = prediction.toPlace();
        await place.fetchFields({ fields: ["id", "displayName", "formattedAddress", "location"] });
        const next = {
          id: `location-${Date.now()}`,
          label: value.label || "Selected location",
          placeId: place.id,
          address: place.formattedAddress || place.displayName || "Selected location",
          latitude: place.location?.lat(),
          longitude: place.location?.lng(),
        };
        setManualAddress(next.address);
        onSelectRef.current(next);
      });
    }).catch((reason: Error) => setError(reason.message));
    return () => { active = false; element?.remove(); };
  }, [key, label, value.label]);

  function useManualLocation() {
    const address = manualAddress.trim();
    if (!address) return;
    onSelect({ ...value, id: value.id || `location-${Date.now()}`, address, placeId: value.placeId || "manual-demo-location" });
  }

  return (
    <div className="location-picker">
      <label>{label}</label>
      {key ? <div ref={mount} className="place-autocomplete" /> : <div className="demo-map-note"><b>Demo location mode</b><span>Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to Vercel to enable the DiagHub Google Places search.</span></div>}
      <label className="manual-address">Address
        <textarea value={manualAddress} onChange={(event) => setManualAddress(event.target.value)} placeholder="House / shop number, street, area, city and pincode" />
      </label>
      <button type="button" className="secondary-action" onClick={useManualLocation}>Use this location</button>
      {value.address ? <small className="selected-location">✓ Selected: {value.address}</small> : null}
      {error ? <small className="form-error">{error}</small> : null}
    </div>
  );
}
