export type RoadPoint = { latitude?: number; longitude?: number };
export type RoadRoute = { distanceMeters: number; durationSeconds: number; returnDistanceMeters?: number; source: "openrouteservice"; geometry?: [number, number][] };

export class RoutingError extends Error {}

export function routingPoint(point: RoadPoint | undefined): point is { latitude: number; longitude: number } {
  return Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
    && Math.abs(point!.latitude!) <= 90 && Math.abs(point!.longitude!) <= 180;
}

// Shared by the web API and trusted delivery/payment backend. Never import a key here.
export function createRoadRouter(key: string | undefined, fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; value: Promise<RoadRoute> }>();
  return async function roadRoute(from: RoadPoint, to: RoadPoint, includeReturn = false, geometry = false): Promise<RoadRoute> {
    if (!routingPoint(from) || !routingPoint(to)) throw new RoutingError("Save both the store and destination map pins to calculate a road route.");
    if (!key?.trim()) throw new RoutingError("Road routing is not configured. Please choose self pickup or try again later.");
    const coordinates = [[from.longitude, from.latitude], [to.longitude, to.latitude]];
    const cacheKey = JSON.stringify([coordinates, includeReturn, geometry]);
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = (async () => {
      if (includeReturn) {
        const [outward, back] = await Promise.all([roadRoute(from, to, false, geometry), roadRoute(to, from)]);
        return { ...outward, returnDistanceMeters: back.distanceMeters };
      }
      let response: Response;
      try {
        response = await fetcher(`https://api.heigit.org/openrouteservice/v2/directions/driving-car/${geometry ? "geojson" : "json"}`, {
          method: "POST", headers: { Authorization: key.trim(), "Content-Type": "application/json" },
          body: JSON.stringify({ coordinates, instructions: false, geometry, units: "m" }),
          signal: AbortSignal.timeout(10000),
        });
      } catch { throw new RoutingError("Road routing timed out. Retry or choose self pickup."); }
      if (!response.ok) throw new RoutingError(response.status === 429
        ? "Road routing is busy. Please retry shortly or choose self pickup."
        : [401, 403].includes(response.status) ? "Road routing is temporarily unavailable. Please choose self pickup or contact support."
        : "No road route is available. Check the map pins, retry or choose self pickup.");
      const body = await response.json().catch(() => null);
      const feature = geometry ? body?.features?.[0] : undefined;
      const route = geometry ? feature?.properties : body?.routes?.[0];
      const distance = route?.summary?.distance;
      const duration = route?.summary?.duration;
      if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0 || !Number.isSafeInteger(Math.round(distance))
        || typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
        throw new RoutingError("The routing provider returned an invalid distance. Please retry.");
      }
      const line = feature?.geometry;
      if (geometry && (line?.type !== "LineString" || !Array.isArray(line.coordinates) || line.coordinates.length < 2 || line.coordinates.length > 20000
        || line.coordinates.some((point: unknown) => !Array.isArray(point) || point.length < 2 || !routingPoint({ longitude: point[0], latitude: point[1] })))) {
        throw new RoutingError("The road route could not be drawn. Please retry.");
      }
      return { distanceMeters: Math.round(distance), durationSeconds: Math.round(duration), source: "openrouteservice" as const,
        ...(geometry ? { geometry: line.coordinates.map((point: number[]) => [point[0], point[1]] as [number, number]) } : {}) };
    })();
    // Only a small, short-lived cache; failures are always retryable.
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { expires: Date.now() + 5 * 60_000, value });
    value.catch(() => { if (cache.get(cacheKey)?.value === value) cache.delete(cacheKey); });
    return value;
  };
}
