"use client";
import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "./firebase";
import { deliveryCall, type RiderDelivery, type RiderPosition } from "./rider";
import { freshRiderPosition, newerRiderPosition, parseRiderPosition, type RiderProgress } from "./rider-tracking";
import type { RoadRoute } from "./road-routing";

type Tracking = { key: string; position: RiderPosition | null; progress?: RiderProgress; route?: RoadRoute; routeFromRider?: boolean; error?: string; routeError?: string; ended?: boolean };
type Response = { state: string; position: unknown; progress?: RiderProgress | null; route?: RoadRoute; routeFromRider?: boolean; routeError?: string };
export function useDeliveryTracking(delivery: RiderDelivery, uid?: string) {
  const key = `${uid}:${delivery.id}:${delivery.state}:${delivery.exchangeAt ?? 0}`;
  const [state, setState] = useState<Tracking>();
  const [now, setNow] = useState(0);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (!uid || !["ASSIGNED", "ACCEPTED", "PICKED_UP"].includes(delivery.state)) return;
    let stopped = false, inFlight = false, lastRoute = 0, fromRider = false;
    let latest: RiderPosition | null = null;
    let routedPosition: RiderPosition | null = null;
    let routeAvailable = false;
    let routeFailed = false;
    const accept = (next: RiderPosition | null) => {
      latest = newerRiderPosition(latest, next);
      setNow(Date.now());
      setState((current) => ({ ...(current?.key === key ? current : { key }), position: latest, error: undefined }));
    };
    const poll = async (force = false) => {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      const clock = Date.now();
      const fresh = freshRiderPosition(latest, clock) && (latest?.accuracy ?? Infinity) <= 100;
      const moved = latest && routedPosition ? Math.abs(latest.latitude - routedPosition.latitude) + Math.abs(latest.longitude - routedPosition.longitude) > 0.001 : fresh;
      const includeRoute = force || !lastRoute || (clock - lastRoute >= 60000 && (!routeAvailable || moved || fresh !== fromRider)) || (fresh && !fromRider && !routeFailed && clock - lastRoute >= 15000);
      if (includeRoute) lastRoute = clock;
      try {
        const result = await deliveryCall<Response>("getPartXTracking", { deliveryId: delivery.id, includeRoute });
        if (stopped) return;
        if (!["ASSIGNED", "ACCEPTED", "PICKED_UP"].includes(result.state)) {
          latest = null; setState({ key, position: null, ended: true }); return;
        }
        accept(parseRiderPosition(result.position));
        const progress = result.progress;
        if (includeRoute || progress) {
          setState((current) => ({ ...(current?.key === key ? current : { key, position: latest }),
            ...(progress && progress.updatedAt > (current?.progress?.updatedAt ?? 0) ? { progress } : {}),
            ...(includeRoute ? { route: result.route, routeFromRider: result.routeFromRider, routeError: result.routeError } : {}) }));
        }
        if (includeRoute) {
          routeFailed = !result.route; routeAvailable = Boolean(result.route); fromRider = Boolean(result.routeFromRider); routedPosition = latest;
        }
      } catch (reason) {
        if (!stopped) setState((current) => ({ ...(current?.key === key ? current : { key, position: latest }), error: reason instanceof Error ? reason.message : "Tracking connection interrupted. Retrying…" }));
      } finally { inFlight = false; }
    };
    const stopSnapshot = delivery.state === "PICKED_UP" ? onSnapshot(doc(firestore, "deliveries", delivery.id, "location", "current"), { includeMetadataChanges: true }, (snapshot) => {
      if (!stopped && snapshot.exists() && snapshot.data().riderId === delivery.riderId) accept(parseRiderPosition(snapshot.data()));
    }, () => { /* The authenticated polling channel remains available if the live stream fails. */ }) : () => {};
    refresh.current = () => { void poll(true); };
    void poll();
    const timer = window.setInterval(() => { setNow(Date.now()); void poll(); }, 15000);
    const resume = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume);
    return () => { stopped = true; stopSnapshot(); window.clearInterval(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); refresh.current = () => {}; };
  }, [uid, delivery.id, delivery.state, delivery.riderId, key]);
  const current = state?.key === key ? state : undefined;
  return { position: current?.position ?? null, progress: current?.progress, route: current?.route, routeFromRider: current?.routeFromRider,
    error: current?.error, routeError: current?.routeError, ended: current?.ended, now, retry: () => refresh.current() };
}
