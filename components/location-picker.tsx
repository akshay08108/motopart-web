"use client";
import { useState } from "react";
import type { AppLocation } from "@/lib/types";
import { MapLocationPicker } from "./partx/delivery-location-picker";

export function LocationPicker({ value, onSelect, label = "Address" }: { value:AppLocation; onSelect:(location:AppLocation) => void; label?:string }) {
  const [open,setOpen] = useState(false);
  return <div className="location-picker"><label>{label}<textarea name="address" value={value.address} onChange={(event) => onSelect({ ...value, address:event.target.value, latitude:undefined, longitude:undefined, placeId:undefined })} required minLength={10} maxLength={500} placeholder="Building, street, area, city and postcode"/></label><button type="button" className="px-btn px-btn-outline" onClick={() => setOpen(true)}>{value.address ? "Update location on map" : "Add location on map"}</button>{open ? <MapLocationPicker value={value} onSave={onSelect} close={() => setOpen(false)} title={label}/> : null}</div>;
}
