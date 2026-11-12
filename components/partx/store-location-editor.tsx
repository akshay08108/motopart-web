"use client";

import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { hasMapPin } from "@/lib/delivery-pricing";
import { firestore } from "@/lib/firebase";
import type { AppLocation } from "@/lib/types";
import { MapLocationPicker } from "./delivery-location-picker";

export function StoreLocationEditor({ storeId, initialLocation }: { storeId: string; initialLocation: AppLocation }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const pinned = hasMapPin(initialLocation);

  async function saveLocation(location: AppLocation) {
    if (!hasMapPin(location)) throw new Error("Select a store pin before saving.");
    const address = location.address.trim();
    const savedLocation = {
      id: location.id,
      label: location.label,
      address,
      latitude: location.latitude,
      longitude: location.longitude,
      ...(location.placeId ? { placeId: location.placeId } : {}),
    };
    await updateDoc(doc(firestore, "stores", storeId), {
      address,
      location: savedLocation,
      updatedAt: serverTimestamp(),
    });
    setSaved(true);
  }

  return <section className="sx-store-location">
    <h3>Store pickup location</h3>
    {initialLocation.address && <p>{initialLocation.address}</p>}
    <p role="status">{saved && pinned ? "Store location and map pin saved." : pinned ? "Map pin saved" : "Delivery pricing needs a map pin for this store."}</p>
    <button className="sx-secondary" type="button" onClick={() => { setSaved(false); setOpen(true); }}>
      {pinned ? "Update location on map" : "Add location on map"}
    </button>
    {open && <MapLocationPicker
      value={initialLocation}
      onSave={saveLocation}
      close={() => setOpen(false)}
      title="Store pickup location"
      saveLabel="Save store location"
      requirePin
    />}
  </section>;
}
