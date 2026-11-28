"use client";

import Image from "next/image";
import { useState } from "react";
import type { Vehicle } from "@/lib/types";
import { vehiclePhoto, type VehiclePhotoRecord } from "@/lib/vehicle-photo";
import { Icon } from "./icons";
import styles from "./vehicle-photo.module.css";

type Props = { vehicle: Pick<Vehicle, "make" | "model" | "vehicleModelId">; compact?: boolean; showCaption?: boolean; personalPhoto?: string };

export function VehiclePhoto({ vehicle, compact = false, showCaption = true, personalPhoto }: Props) {
  const photo = vehiclePhoto(vehicle);
  const [failedSrc, setFailedSrc] = useState("");
  const hasPersonalPhoto = Boolean(personalPhoto && failedSrc !== personalPhoto);
  return <div data-vehicle-photo className={`${styles.frame} ${compact ? styles.compact : ""}`}>
    {hasPersonalPhoto ? <Image src={personalPhoto!} alt="" width={640} height={400} unoptimized onError={() => setFailedSrc(personalPhoto!)}/> : photo && failedSrc !== photo.src ? <Image src={photo.src} alt={`${vehicle.make} ${vehicle.model} reference photo`} width={640} height={400} sizes={compact ? "120px" : "(max-width: 600px) 90vw, 320px"} onError={() => setFailedSrc(photo.src)}/> : <div className={styles.placeholder}><Icon name="car"/>{!compact && <span>Model photo not available yet</span>}</div>}
    {!hasPersonalPhoto && photo && !compact && showCaption && failedSrc !== photo.src && <small>Model reference · year, trim and colour may differ</small>}
  </div>;
}

export function VehiclePhotoCredit({ photo }: { photo: VehiclePhotoRecord }) {
  return <span className={styles.credit}><a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">{photo.make} {photo.model} photo</a> by {photo.author} · <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> · resized to WebP</span>;
}
