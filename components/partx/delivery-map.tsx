"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { deliveryDate, timestampMillis, type RiderDelivery, type RiderPosition } from "@/lib/rider";

const apiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
export function DeliveryMap({ delivery }: { delivery: RiderDelivery }) {
  const [position, setPosition] = useState<RiderPosition | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState("");
  const mount = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const rider = useRef<Marker | null>(null);
  const latest = useRef<RiderPosition | null>(null);
  const hasFreshPosition = Boolean(position?.updatedAt && now && now - position.updatedAt < 45_000 && position.accuracy <= 100);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    queueMicrotask(() => { setPosition(null); setError(""); });
    if (delivery.state !== "PICKED_UP") return;
    return onSnapshot(doc(firestore, "deliveries", delivery.id, "location", "current"), { includeMetadataChanges: true }, (snapshot) => {
      const data = snapshot.data();
      setPosition(data ? { latitude: data.latitude, longitude: data.longitude, accuracy: data.accuracy, updatedAt: timestampMillis(data.updatedAt) } : null);
      setNow(Date.now());
      setError(snapshot.metadata.fromCache ? "Reconnecting · Showing the last received location" : "");
    }, () => setError("Tracking is temporarily unavailable. Contact your rider for an update."));
  }, [delivery.id, delivery.state]);
  useEffect(() => {
    latest.current = position;
    if (position && map.current && rider.current) rider.current.setLatLng([position.latitude, position.longitude]);
  }, [position]);
  useEffect(() => {
    if (!apiKey || !mount.current) return;
    let cancelled = false;
    let instance: LeafletMap | undefined;
    void import("leaflet").then((L) => {
      if (cancelled || !mount.current) return;
      const destination = delivery.destination;
      const pickup = delivery.pickup;
      const center: [number, number] = [destination.latitude ?? pickup.latitude ?? 19.076, destination.longitude ?? pickup.longitude ?? 72.8777];
      instance = L.map(mount.current).setView(center, 13);
      map.current = instance;
      L.tileLayer(`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`, {
        tileSize: 512, zoomOffset: -1, maxZoom: 20,
        attribution: '<a href="https://www.maptiler.com/copyright/">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
      }).on("tileerror", () => { if (!cancelled) setError("Map could not load. Your delivery status is still available."); }).addTo(instance);
      const points: [number, number][] = [];
      for (const [point, label, className] of [[pickup, "Store", "rx-store-pin"], [destination, "Destination", "rx-destination-pin"]] as const) {
        if (typeof point.latitude === "number" && typeof point.longitude === "number") {
          const latlng: [number, number] = [point.latitude, point.longitude]; points.push(latlng);
          L.marker(latlng, { icon: L.divIcon({ className, html: `<span>${label === "Store" ? "S" : "D"}</span>`, iconSize: [32, 32] }) }).addTo(instance).bindTooltip(label);
        }
      }
      // The marker is hidden until a real location arrives; never animate a simulated route.
      rider.current = L.marker(center, { opacity: 0, icon: L.divIcon({ className: "rx-rider-pin", html: "<span>R</span>", iconSize: [36, 36] }) }).addTo(instance).bindTooltip("PartX rider");
      if (latest.current) rider.current.setLatLng([latest.current.latitude, latest.current.longitude]).setOpacity(1);
      if (points.length > 1) instance.fitBounds(points, { padding: [35, 35], maxZoom: 15 });
    }).catch(() => setError("Map unavailable. Your delivery status is still available."));
    return () => { cancelled = true; instance?.remove(); map.current = null; rider.current = null; };
  }, [delivery.id, delivery.pickup, delivery.destination]);
  useEffect(() => { rider.current?.setOpacity(position && delivery.state === "PICKED_UP" ? 1 : 0); }, [position, delivery.state]);
  return <div className="rx-map-card">
    <div className="rx-map-status"><span className={hasFreshPosition && !error ? "rx-online-dot" : "rx-offline-dot"}/><b>{delivery.state !== "PICKED_UP" ? "Live location starts after pickup" : hasFreshPosition && !error ? "Rider location updating" : position ? "Location update delayed" : "Waiting for rider location"}</b></div>
    {apiKey ? <div ref={mount} className="rx-map" aria-label="Map showing store, delivery destination and rider location"/> : <p>Map unavailable. Please contact the rider for directions.</p>}
    <div className="rx-map-foot"><span>{position?.updatedAt ? `Last updated ${deliveryDate(position.updatedAt)} · Accuracy ±${Math.round(position.accuracy)} m` : "The rider's GPS location will appear when they start sharing."}</span>{position ? <button type="button" className="rx-link" onClick={() => map.current?.setView([position.latitude, position.longitude], 15)}>Find rider</button> : null}</div>
    {error ? <p className="rx-notice" role="status">{error}</p> : null}
  </div>;
}
