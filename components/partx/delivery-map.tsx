"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline, Circle } from "leaflet";
import { deliveryDate, type RiderDelivery, type RiderPosition } from "@/lib/rider";
import type { RoadRoute } from "@/lib/road-routing";
import { routingPoint } from "@/lib/road-routing";
import { formatTrackingDistance, freshRiderPosition, type TrailPoint } from "@/lib/rider-tracking";
import { useDeliveryTracking } from "@/lib/use-delivery-tracking";
import { usePartX } from "./app-provider";

const apiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
const bike = '<span><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="8" cy="23" r="5"/><circle cx="25" cy="23" r="5"/><path d="m8 23 7-11h6l4 11M12 12H8m7 0 5 11H8m11-16h4l2 6"/></svg></span>';

type CanvasProps = { delivery: RiderDelivery; position: RiderPosition | null; route?: RoadRoute; trail?: TrailPoint[]; fresh: boolean; focusRider: number; onError: (message: string) => void };
// Rendering is separate from data access so delayed SDK loading cannot lose the first GPS fix.
export function DeliveryMapCanvas({ delivery, position, route, trail, fresh, focusRider, onError }: CanvasProps) {
  const mount = useRef<HTMLDivElement>(null);
  const draw = useRef<(value: Omit<CanvasProps, "onError">) => void>(() => {});
  const current = useRef({ delivery, position, route, trail, fresh, focusRider });
  const returning = delivery.kind === "replacement" && Boolean(delivery.exchangeAt);
  const pickup = returning ? delivery.destination : delivery.pickup;
  const destination = returning ? delivery.pickup : delivery.destination;
  useEffect(() => {
    current.current = { delivery, position, route, trail, fresh, focusRider };
    draw.current(current.current);
  }, [delivery, position, route, trail, fresh, focusRider]);
  useEffect(() => {
    if (!apiKey || !mount.current) return;
    let cancelled = false;
    let instance: LeafletMap | undefined;
    let animation = 0;
    void import("leaflet").then((L) => {
      if (cancelled || !mount.current) return;
      const latest = current.current;
      const back = latest.delivery.kind === "replacement" && Boolean(latest.delivery.exchangeAt);
      const pickup = back ? latest.delivery.destination : latest.delivery.pickup;
      const destination = back ? latest.delivery.pickup : latest.delivery.destination;
      const center: [number, number] = routingPoint(destination) ? [destination.latitude, destination.longitude] : routingPoint(pickup) ? [pickup.latitude, pickup.longitude] : [19.076, 72.8777];
      const view = L.map(mount.current).setView(center, 13);
      instance = view;
      L.tileLayer(`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`, {
        tileSize: 512, zoomOffset: -1, maxZoom: 20,
        attribution: '<a href="https://www.maptiler.com/copyright/">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
      }).on("tileerror", () => { if (!cancelled) onError("Map tiles could not load. Delivery status and GPS update times are still available."); }).addTo(view);
      const basePoints: [number, number][] = [];
      for (const [point, label, className, initial] of [[pickup, "Pickup", "rx-store-pin", "P"], [destination, "Drop-off", "rx-destination-pin", "D"]] as const) {
        if (!routingPoint(point)) continue;
        const latlng: [number, number] = [point.latitude, point.longitude]; basePoints.push(latlng);
        L.marker(latlng, { icon: L.divIcon({ className, html: `<span>${initial}</span>`, iconSize: [32, 32], iconAnchor: [16, 16] }) }).addTo(view).bindTooltip(label);
      }
      const marker: Marker = L.marker(center, { opacity: 0, zIndexOffset: 1000, icon: L.divIcon({ className: "rx-rider-pin", html: bike, iconSize: [42, 42], iconAnchor: [21, 21] }) }).addTo(view).bindTooltip("PartX rider · last received GPS");
      const halo: Circle = L.circle(center, { radius: 0, weight: 1, color: "#168c65", fillOpacity: 0.08, interactive: false }).addTo(view);
      view.createPane("coveredRoute").style.zIndex = "450";
      const covered = L.polyline([], { pane: "coveredRoute", color: "#11855e", weight: 5, opacity: 0.95, interactive: false }).addTo(view);
      let lines: Polyline[] = [];
      let geometry: RoadRoute["geometry"];
      let drawnTrail: TrailPoint[] | undefined;
      let previous: RiderPosition | null = null;
      let framing = "";
      let focused = current.current.focusRider;
      draw.current = (value) => {
        if (cancelled) return;
        const next = value.position;
        if (value.route?.geometry !== geometry) {
          geometry = value.route?.geometry;
          lines.forEach((line) => line.remove()); lines = [];
          if (geometry?.length) {
            const coordinates = geometry.map(([lng, lat]) => [lat, lng] as [number, number]);
            lines = [L.polyline(coordinates, { color: "#fff", weight: 8, opacity: 0.85, interactive: false }), L.polyline(coordinates, { color: "#ed1024", weight: 5, opacity: 0.95, dashArray: "8 9", lineCap: "round", lineJoin: "round", interactive: false })];
            lines.forEach((line) => line.addTo(view));
          }
        }
        if (drawnTrail !== value.trail) {
          drawnTrail = value.trail;
          const segments: [number, number][][] = [];
          for (const point of drawnTrail ?? []) {
            if (!segments.length || point.startsSegment) segments.push([]);
            segments[segments.length - 1].push([point.latitude, point.longitude]);
          }
          covered.setLatLngs(segments);
        }
        marker.setOpacity(next ? 1 : 0);
        marker.getElement()?.classList.toggle("is-stale", !value.fresh);
        if (next) {
          const changed = !previous || previous.latitude !== next.latitude || previous.longitude !== next.longitude;
          halo.setLatLng([next.latitude, next.longitude]).setRadius(next.accuracy).setStyle({ opacity: value.fresh ? 0.4 : 0.15 });
          if (changed) {
            window.cancelAnimationFrame(animation);
            const start = marker.getLatLng();
            const distance = view.distance(start, [next.latitude, next.longitude]);
            if (previous && value.fresh && distance < 500 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
              const began = performance.now();
              const step = (time: number) => {
                if (cancelled) return;
                const progress = Math.min(1, (time - began) / 800);
                marker.setLatLng([start.lat + (next.latitude - start.lat) * progress, start.lng + (next.longitude - start.lng) * progress]);
                if (progress < 1) animation = window.requestAnimationFrame(step);
              };
              animation = window.requestAnimationFrame(step);
            } else marker.setLatLng([next.latitude, next.longitude]);
          }
          previous = next;
        } else { halo.setRadius(0); previous = null; }
        const frame = `${next ? "rider" : "pickup"}:${geometry ? "road" : "points"}:${Boolean(drawnTrail?.length)}`;
        if (frame !== framing) {
          const points: [number, number][] = [...basePoints, ...(geometry?.map(([lng, lat]) => [lat, lng] as [number, number]) ?? [])];
          if (drawnTrail) points.push(...drawnTrail.map(({ latitude, longitude }) => [latitude, longitude] as [number, number]));
          if (next) points.push([next.latitude, next.longitude]);
          if (points.length) view.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
          framing = frame;
        }
        if (next && focused !== value.focusRider) { view.setView([next.latitude, next.longitude], 16); focused = value.focusRider; }
      };
      draw.current(current.current);
      view.invalidateSize();
    }).catch(() => onError("Map unavailable. Your delivery status is still available."));
    return () => { cancelled = true; window.cancelAnimationFrame(animation); draw.current = () => {}; instance?.remove(); };
  }, [delivery.id, pickup.latitude, pickup.longitude, destination.latitude, destination.longitude, onError]);
  return apiKey ? <div ref={mount} className="rx-map" aria-label="Delivery map showing the rider’s GPS trail, route to drop-off and latest position"/> : <p>The map is unavailable. Distance updates appear below.</p>;
}

export function DeliveryMap({ delivery }: { delivery: RiderDelivery }) {
  const { user } = usePartX();
  const tracking = useDeliveryTracking(delivery, user?.id);
  const [focus, setFocus] = useState(0);
  const [mapError, setMapError] = useState("");
  const fresh = freshRiderPosition(tracking.position, tracking.now);
  const approximate = (tracking.position?.accuracy ?? 0) > 100;
  const status = tracking.ended ? "Ride finished · Live tracking stopped" : delivery.state !== "PICKED_UP" ? "Planned route · Live GPS starts after pickup"
    : fresh ? approximate ? "Rider location received · Approximate GPS" : "Rider location updating" : tracking.position ? "GPS update delayed · Showing last received position" : "Waiting for the rider’s first confirmed GPS update";
  return <div className="rx-map-card">
    <div className="rx-map-status" role="status"><span className={fresh ? "rx-online-dot" : "rx-offline-dot"}/><b>{status}</b><button type="button" className="rx-link" onClick={tracking.retry}>Refresh tracking</button></div>
    <DeliveryMapCanvas delivery={delivery} position={tracking.position} route={tracking.route} trail={tracking.progress?.trail} fresh={fresh} focusRider={focus} onError={setMapError}/>
    {delivery.state === "PICKED_UP" && !tracking.ended && <div className="rx-route-summary">
      <b className="rx-route-key rx-route-key-covered">Distance covered</b>
      <span>{tracking.progress ? formatTrackingDistance(tracking.progress.coveredMeters) : "Waiting for reliable GPS"}</span>
      {tracking.progress && <small>Estimated from GPS points received since pickup. Gaps in sharing may leave parts of the trip unrecorded.</small>}
    </div>}
    {tracking.route && <div className="rx-route-summary">
      <b className="rx-route-key rx-route-key-planned">{tracking.routeFromRider ? fresh ? "Distance remaining" : "Last remaining distance estimate" : "Planned route distance"}</b>
      <span>{formatTrackingDistance(tracking.route.distanceMeters)} · ~{Math.max(1, Math.round(tracking.route.durationSeconds / 60))} min driving</span>
      <small>Road estimate, excluding traffic and stops.</small>
    </div>}
    <div className="rx-map-foot"><span>{tracking.position?.updatedAt ? `Last received ${deliveryDate(tracking.position.updatedAt)} · Accuracy ±${Math.round(tracking.position.accuracy)} m` : "No GPS update has reached this delivery yet. Ask the rider to allow location access and keep PartX Rider open."}</span>{tracking.position && <button type="button" className="rx-link" onClick={() => setFocus((value) => value + 1)}>Find rider</button>}</div>
    {tracking.route && <p className="rx-route-credit"><a href="https://openrouteservice.org/" target="_blank" rel="noreferrer">© openrouteservice.org by HeiGIT</a> · Map data © OpenStreetMap contributors</p>}
    {mapError || tracking.error || tracking.routeError ? <p className="rx-notice" role="status">{mapError || tracking.error || tracking.routeError}</p> : null}
  </div>;
}
