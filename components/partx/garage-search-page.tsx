"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Garage, Vehicle } from "@/lib/types";
import { vehicleDetails, vehicleName } from "@/lib/vehicle-display";
import { savePrivatePhoto, usePrivatePhoto } from "@/lib/account-photos";
import { PhotoControls } from "./photo-controls";
import { usePartX } from "./app-provider";
import { Icon } from "./icons";
import styles from "./garage-search-page.module.css";
import { VehiclePicker } from "./vehicle-picker";
import { VehiclePhoto, VehiclePhotoCredit } from "./vehicle-photo";
import { vehiclePhoto } from "@/lib/vehicle-photo";
import { DeliveryLocationPicker } from "./delivery-location-picker";
import { LocationPicker } from "../location-picker";
import type { AppLocation } from "@/lib/types";

export function GarageSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const afterVehicleSetup = searchParams.get("checkout") === "1" ? "/checkout" : "/";
  const { user, vehicles, garageReady, activeVehicleId, setActiveVehicleId, addVehicle, removeVehicle, location, garages, addGarage, needsVehicle, skipVehicleSetup } = usePartX();
  const addVehicleButton = useRef<HTMLButtonElement>(null);
  const confirmRemoveButton = useRef<HTMLButtonElement>(null);
  const removeOrigin = useRef("");
  const [confirmRemoveId, setConfirmRemoveId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [vehicleNotice, setVehicleNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [vehicleDialog, setVehicleOpen] = useState(searchParams.get("add") === "vehicle");
  const vehicleOpen = vehicleDialog || needsVehicle;
  const [garageOpen, setGarageOpen] = useState(false);
  const [garageLocation,setGarageLocation] = useState<AppLocation>({ id:"garage-draft", label:"Garage", address:"" });
  const [locationOpen, setLocationOpen] = useState(false);
  useEffect(() => {
    if (confirmRemoveId) confirmRemoveButton.current?.focus();
    else if (removeOrigin.current) {
      (document.getElementById(`remove-vehicle-${removeOrigin.current}`) ?? addVehicleButton.current)?.focus();
      removeOrigin.current = "";
    }
  }, [confirmRemoveId]);
  const activeVehicle = useMemo(() => vehicles.find((vehicle) => vehicle.id === activeVehicleId), [activeVehicleId, vehicles]);
  const activePhoto = usePrivatePhoto(activeVehicle ? user?.id : undefined, activeVehicle?.id);

  const resetVehicleDialog = () => {
    setVehicleOpen(false);
    if (searchParams.has("add")) router.replace("/garage");
    setSaveError("");
  };

  const saveVehicle = async (vehicle?: Vehicle) => {
    setSaving(true);
    setSaveError("");
    try {
      if (vehicle) await addVehicle(vehicle);
      else await skipVehicleSetup();
      resetVehicleDialog();
      if (needsVehicle) router.replace(afterVehicleSetup);
    } catch {
      setSaveError("Could not save your vehicle settings. Try again.");
    } finally {
      setSaving(false);
    }
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
      <button ref={addVehicleButton} className="px-btn px-btn-red" disabled={Boolean(removingId)} onClick={() => setVehicleOpen(true)}><Icon name="plus"/>Add vehicle</button>
    </div>

    {activeVehicle ? <section className={styles.activeHero}>
      <div className={styles.activeImage}><VehiclePhoto vehicle={activeVehicle} showCaption={false} personalPhoto={activePhoto}/></div>
      <div><span>ACTIVE VEHICLE</span><h2>{vehicleName(activeVehicle)}</h2><p>{vehicleDetails(activeVehicle)}</p>{!activePhoto && vehiclePhoto(activeVehicle) && <small className={styles.photoNote}>Model reference photo · year, trim and colour may differ</small>}{activeVehicle.registration ? <small>{activeVehicle.registration}</small> : null}</div>
      <Link className="px-btn px-btn-dark" href="/shop">Shop compatible parts <Icon name="arrow"/></Link>
    </section> : null}

    <div className="px-dashboard-grid">
      <section className="px-panel px-panel-wide"><div className="px-panel-head"><div><span>MY VEHICLES</span><h2>{vehicles.length ? "Select your active vehicle" : "Select your vehicle"}</h2></div></div>
        {!vehicles.length ? <p>Your garage is empty. Add a vehicle to shop for compatible parts.</p> : null}
        {!vehicleOpen && !garageOpen && saveError && <p role="alert">{saveError}</p>}
        {vehicleNotice && <p className={styles.vehicleNotice} role="status">{vehicleNotice}</p>}
        <div className={styles.vehicleList}>{vehicles.map((vehicle) => <article className={`${styles.vehicleCard} ${activeVehicleId === vehicle.id ? styles.activeCard : ""}`} key={vehicle.id}>
          <button type="button" className={styles.selectVehicle} aria-pressed={activeVehicleId === vehicle.id} disabled={Boolean(removingId)} onClick={() => void setActiveVehicleId(vehicle.id).catch(() => setSaveError("Could not change your active vehicle. Try again."))}>
            <GarageVehiclePhoto vehicle={vehicle} uid={user?.id}/><span><b>{vehicleName(vehicle)}</b><small>{vehicleDetails(vehicle)}</small>{vehicle.registration && <small>{vehicle.registration}</small>}</span>
            {activeVehicleId === vehicle.id ? <em><Icon name="check"/>Active</em> : null}
          </button>
          {user && /^[A-Za-z0-9_-]{1,128}$/.test(vehicle.id) && <div className={styles.vehiclePhotoActions}>
            <GaragePhotoControls uid={user.id} vehicle={vehicle} disabled={Boolean(removingId)}/>
          </div>}
          {confirmRemoveId === vehicle.id ? <div className={styles.removeConfirm}>
            <p>Remove {vehicleName(vehicle)} from your garage?</p><small>You can add it again. Your orders and cart will stay saved.</small>
            <div><button ref={confirmRemoveButton} type="button" disabled={Boolean(removingId)} onClick={async () => {
              setRemovingId(vehicle.id); setSaveError(""); setVehicleNotice("");
              try { await removeVehicle(vehicle.id); setConfirmRemoveId(""); setVehicleNotice(`${vehicleName(vehicle)} removed from your garage.`); }
              catch { setSaveError("Could not remove this vehicle. Check your connection and try again."); }
              finally { setRemovingId(""); }
            }}>{removingId === vehicle.id ? "Removing…" : "Remove vehicle"}</button><button type="button" disabled={Boolean(removingId)} onClick={() => setConfirmRemoveId("")}>Cancel</button></div>
          </div> : <button type="button" id={`remove-vehicle-${vehicle.id}`} className={styles.removeVehicle} disabled={Boolean(removingId)} aria-label={`Remove ${vehicleName(vehicle)}`} onClick={() => { removeOrigin.current = vehicle.id; setConfirmRemoveId(vehicle.id); setVehicleNotice(""); setSaveError(""); }}><Icon name="trash"/>Remove</button>}
        </article>)}</div>
        {vehicles.some((vehicle) => vehiclePhoto(vehicle)) && <details className={styles.photoCredits}><summary>Vehicle photo credits</summary>{vehicles.filter((vehicle, index, list) => {
          const photo = vehiclePhoto(vehicle);
          return photo && list.findIndex((item) => vehiclePhoto(item)?.src === photo.src) === index;
        }).map((vehicle) => <VehiclePhotoCredit key={vehicle.id} photo={vehiclePhoto(vehicle)!}/>)}</details>}
      </section>
      <section className="px-panel"><div className="px-panel-head"><div><span>DELIVERY LOCATION</span><h2>{location.label}</h2></div><button onClick={() => setLocationOpen(true)}>Edit</button></div><p className="px-address"><Icon name="pin"/>{location.address}</p></section>
      <section className="px-panel"><div className="px-panel-head"><div><span>TRUSTED GARAGES</span><h2>{garages.length} saved</h2></div><button onClick={() => setGarageOpen(true)}>Add</button></div>{garages.map((garage) => <div className="px-garage-row" key={garage.id}><div className="px-square-icon"><Icon name="garage"/></div><div><b>{garage.name}</b><span>{garage.services}</span><small>{garage.location.address}</small></div></div>)}</section>
    </div>

    {vehicleOpen && !garageReady ? <p role="status">Loading your garage…</p> : null}
    {vehicleOpen && garageReady ? <VehiclePicker vehicles={vehicles} activeVehicleId={activeVehicleId} saving={saving} error={saveError}
      canClose={!needsVehicle} onClose={resetVehicleDialog} onSave={(vehicle) => void saveVehicle(vehicle)}
      onSkip={needsVehicle ? () => void saveVehicle() : undefined}
      onSelectSaved={async (id) => {
        setSaving(true);
        setSaveError("");
        try {
          await setActiveVehicleId(id);
          if (needsVehicle) await skipVehicleSetup();
          resetVehicleDialog();
          if (needsVehicle) router.replace(afterVehicleSetup);
        } catch { setSaveError("Could not select this vehicle. Try again."); }
        finally { setSaving(false); }
      }}/> : null}

    {garageOpen ? <SimpleModal title="Add a trusted garage" close={() => setGarageOpen(false)}><form className="px-form" onSubmit={(event) => void saveGarage(event)}><label>Garage name<input name="name" required/></label><label>Phone<input name="phone" required/></label><label>Services<input name="services" placeholder="Installation, diagnostics" required/></label><LocationPicker value={garageLocation} onSelect={setGarageLocation} label="Garage address"/>{saveError && <p role="alert">{saveError}</p>}<button className="px-btn px-btn-red" type="submit" disabled={saving}>{saving ? "Saving…" : "Save garage"}</button></form></SimpleModal> : null}
    {locationOpen ? <DeliveryLocationPicker close={() => setLocationOpen(false)}/> : null}
  </div>;
}

function GarageVehiclePhoto({ vehicle, uid }: { vehicle: Vehicle; uid?: string }) {
  const personalPhoto = usePrivatePhoto(uid, vehicle.id);
  return <VehiclePhoto vehicle={vehicle} compact personalPhoto={personalPhoto}/>;
}

function GaragePhotoControls({ uid, vehicle, disabled }: { uid: string; vehicle: Vehicle; disabled: boolean }) {
  const photo = usePrivatePhoto(uid, vehicle.id);
  return <PhotoControls label={`${vehicle.model} photo`} hasPhoto={Boolean(photo)} disabled={disabled}
    save={(image) => savePrivatePhoto(uid, image, vehicle.id)}/>;
}

function SimpleModal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className={`${styles.dialog} ${styles.simpleDialog}`} role="dialog" aria-modal="true"><header className={styles.dialogHeader}><h2>{title}</h2><button onClick={close} aria-label={`Close ${title}`}><Icon name="close"/></button></header><div className={styles.simpleBody}>{children}</div></div></div>;
}
