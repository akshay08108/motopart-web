"use client";
import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { AppLocation } from "@/lib/types";
import { LocationPicker } from "../location-picker";

export function StoreLocationEditor({ storeId, initialLocation }: { storeId:string; initialLocation:AppLocation }) {
  const [location,setLocation] = useState(initialLocation);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  return <div><LocationPicker value={location} onSelect={(next) => { setLocation(next); setMessage(""); }} label="Store address"/><button className="sx-secondary" type="button" disabled={busy || location.address.trim().length < 10} onClick={async () => {
    setBusy(true); setMessage("");
    try { const saved = Object.fromEntries(Object.entries({ ...location, address:location.address.trim() }).filter(([,value]) => value !== undefined)); await updateDoc(doc(firestore,"stores",storeId), { address:location.address.trim(), location:saved, updatedAt:serverTimestamp() }); setMessage("Store location saved."); }
    catch { setMessage("Store location could not be saved. Please try again."); }
    finally { setBusy(false); }
  }}>{busy ? "Saving location…" : "Save store location"}</button>{message ? <p role="status">{message}</p> : null}</div>;
}
