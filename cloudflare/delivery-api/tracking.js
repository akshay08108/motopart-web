import { DeliveryError } from "../../functions/rider-core.js";
import { parseRiderPosition, freshRiderPosition, recordRiderProgress } from "../../lib/rider-tracking.ts";
import { routingPoint } from "../../lib/road-routing.ts";

export const trackingEndpoints = new Set(["getPartXTracking", "publishPartXRiderLocation"]);
export function createTracking(database, route, runtime) {
  const fail = (code, message) => { throw new DeliveryError(code, message); };
  const refFor = (id) => {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) fail("invalid-argument", "Choose a valid delivery.");
    return database.doc(`deliveries/${id}`);
  };
  const millis = (value) => typeof value?.toMillis === "function" ? value.toMillis() : null;
  async function publish(uid, input) {
    const ref = refFor(input.deliveryId);
    const position = parseRiderPosition(input);
    if (!position || !Number.isFinite(input.capturedAt) || Math.abs(Date.now() - input.capturedAt) > 30000) fail("invalid-argument", "A fresh GPS fix is required. Keep location access enabled and retry.");
    const sharedAt = await database.runTransaction(async (tx) => {
      const [snapshot, profile, rider] = await Promise.all([tx.get(ref), tx.get(database.doc(`users/${uid}`)), tx.get(database.doc(`riders/${uid}`))]);
      const delivery = snapshot.data(); const user = profile.data(); const record = rider.data();
      const role = user?.activeRole ?? (user?.roles?.length === 1 ? user.roles[0] : null);
      if (role !== "rider" || !user?.roles?.includes("rider") || !record?.active || delivery?.riderId !== uid || record.activeDeliveryId !== input.deliveryId) fail("permission-denied", "Only the assigned rider can share this delivery's location.");
      if (delivery.state !== "PICKED_UP") fail("failed-precondition", "Location sharing is available only after pickup and stops when the ride ends.");
      const pointRef = database.doc(`deliveries/${input.deliveryId}/location/current`);
      const previous = (await tx.get(pointRef)).data();
      if (millis(previous?.updatedAt) > Date.now() - 8000) return millis(previous.updatedAt);
      const progressRef = database.doc(`deliveries/${input.deliveryId}/location/progress`);
      const saved = (await tx.get(progressRef)).data();
      const oldProgress = saved?.riderId === uid ? saved : undefined;
      const progress = recordRiderProgress(oldProgress, position, input.capturedAt);
      tx.set(pointRef, { riderId: uid, latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy, updatedAt: runtime.serverTimestamp() });
      if (progress && progress !== oldProgress) tx.set(progressRef, { ...progress, riderId: uid });
      return Date.now();
    });
    return { sharedAt };
  }
  async function read(uid, input) {
    const delivery = (await refFor(input.deliveryId).get()).data();
    if (!delivery) fail("not-found", "Delivery not found.");
    if (delivery.riderId === uid && delivery.customerId !== uid) {
      const [profile, rider] = await Promise.all([database.doc(`users/${uid}`).get(), database.doc(`riders/${uid}`).get()]);
      const user = profile.data();
      const role = user?.activeRole ?? (user?.roles?.length === 1 ? user.roles[0] : null);
      if (role !== "rider" || !user?.roles?.includes("rider") || !rider.data()?.active) fail("permission-denied", "An active rider account is required.");
    }
    if (delivery.customerId !== uid && delivery.riderId !== uid) {
      if (delivery.sellerId !== uid || (await database.doc(`stores/${delivery.storeId}`).get()).data()?.ownerId !== uid) fail("permission-denied", "This delivery does not belong to your account.");
    }
    if (!["ASSIGNED", "ACCEPTED", "PICKED_UP"].includes(delivery.state)) return { state: delivery.state, position: null };
    const [point, saved] = delivery.state === "PICKED_UP" ? await Promise.all([
      database.doc(`deliveries/${input.deliveryId}/location/current`).get().then((doc) => doc.data()),
      database.doc(`deliveries/${input.deliveryId}/location/progress`).get().then((doc) => doc.data()),
    ]) : [];
    const position = point?.riderId === delivery.riderId ? parseRiderPosition(point) : null;
    const progress = saved?.riderId === delivery.riderId ? { coveredMeters: saved.coveredMeters, trail: saved.trail, updatedAt: saved.updatedAt } : null;
    const result = { state: delivery.state, position, progress, returningToStore: delivery.kind === "replacement" && Boolean(delivery.exchangeAt) };
    if (input.includeRoute === true) {
      const start = freshRiderPosition(position, Date.now()) && position.accuracy <= 100 ? position : result.returningToStore ? delivery.destination : delivery.pickup;
      const destination = result.returningToStore ? delivery.pickup : delivery.destination;
      if (!routingPoint(start) || !routingPoint(destination)) return { ...result, routeError: "Save pickup and destination map pins to draw the road route." };
      try { return { ...result, route: await route(start, destination, false, true), routeFromRider: start === position }; }
      catch { return { ...result, routeError: "Road route unavailable. The rider's GPS location will still update. Retry the route shortly." }; }
    }
    return result;
  }
  return { read, publish };
}
