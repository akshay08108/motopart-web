"use client";
import Link from "next/link";
import { useState } from "react";
import { usePartX } from "./app-provider";
import { DeliveryLocationPicker } from "./delivery-location-picker";
import { Icon } from "./icons";

export function DeliveryLocationButton({ className = "", children }: { className?:string; children?:React.ReactNode }) {
  const { location, isGuest } = usePartX();
  const [open,setOpen] = useState(false);
  if (isGuest) return <Link href="/login/customer?signin=1" className={`px-location-button ${className}`}><Icon name="pin"/>Sign in to add a delivery address<Icon name="arrow"/></Link>;
  return <><button type="button" className={`px-location-button ${className}`} onClick={() => setOpen(true)}><Icon name="pin"/>{children ?? (location.address ? `${location.label}: ${location.address.split(",")[0]}` : "Add delivery location")}<Icon name="arrow"/></button>{open ? <DeliveryLocationPicker close={() => setOpen(false)}/> : null}</>;
}
