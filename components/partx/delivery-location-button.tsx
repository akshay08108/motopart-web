"use client";
import { useState } from "react";
import { usePartX } from "./app-provider";
import { DeliveryLocationPicker } from "./delivery-location-picker";
import { Icon } from "./icons";

export function DeliveryLocationButton({ className = "", children }: { className?:string; children?:React.ReactNode }) {
  const { location } = usePartX();
  const [open,setOpen] = useState(false);
  return <><button type="button" className={`px-location-button ${className}`} onClick={() => setOpen(true)}><Icon name="pin"/>{children ?? (location.address ? `${location.label}: ${location.address.split(",")[0]}` : "Add delivery location")}<Icon name="arrow"/></button>{open ? <DeliveryLocationPicker close={() => setOpen(false)}/> : null}</>;
}
