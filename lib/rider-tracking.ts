import type { RiderPosition } from "./rider";

export type TrailPoint = { latitude: number; longitude: number; startsSegment?: true };
export type RiderProgress = { coveredMeters: number; trail: TrailPoint[]; updatedAt: number };
type RecordedProgress = RiderProgress & { anchor: RiderPosition };

const maximumTrailPoints = 300;

export function formatTrackingDistance(metres: number) {
  const distance = new Intl.NumberFormat("en-IN", { maximumFractionDigits: metres < 1000 ? 0 : 1 });
  return metres < 1000 ? `${distance.format(metres)} m` : `${distance.format(metres / 1000)} km`;
}

export function recordRiderProgress(previous: RecordedProgress | undefined, position: RiderPosition, capturedAt: number): RecordedProgress | undefined {
  if (position.accuracy > 50 || (previous && capturedAt <= previous.updatedAt)) return previous;
  const point = { latitude: position.latitude, longitude: position.longitude };
  const anchor = { ...position, updatedAt: capturedAt };
  if (!previous) return { coveredMeters: 0, trail: [point], anchor, updatedAt: capturedAt };
  const gap = capturedAt - previous.updatedAt;
  if (gap > 60_000) {
    return { ...previous, trail: [...previous.trail, { ...point, startsSegment: true as const }].slice(-maximumTrailPoints), anchor, updatedAt: capturedAt };
  }
  const radians = Math.PI / 180;
  const start = previous.anchor;
  const a = Math.sin((point.latitude - start.latitude) * radians / 2) ** 2
    + Math.cos(start.latitude * radians) * Math.cos(point.latitude * radians)
    * Math.sin((point.longitude - start.longitude) * radians / 2) ** 2;
  const metres = 12_742_000 * Math.asin(Math.sqrt(Math.min(1, a)));
  const accuracy = Math.max(start.accuracy, position.accuracy);
  if (metres > 55 * gap / 1000 + accuracy) return previous;
  if (metres < Math.max(12, accuracy)) return { ...previous, updatedAt: capturedAt };
  return { coveredMeters: previous.coveredMeters + Math.round(metres), trail: [...previous.trail, point].slice(-maximumTrailPoints), anchor, updatedAt: capturedAt };
}

export function parseRiderPosition(value: unknown): RiderPosition | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const { latitude, longitude, accuracy } = row;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1000) return null;
  const raw = row.updatedAt;
  const time = typeof raw === "number" ? raw : raw && typeof raw === "object" && "toMillis" in raw && typeof raw.toMillis === "function" ? raw.toMillis() : undefined;
  return { latitude, longitude, accuracy, ...(typeof time === "number" && Number.isFinite(time) ? { updatedAt: time } : {}) };
}
export function freshRiderPosition(position: RiderPosition | null, now: number) {
  return Boolean(position?.updatedAt && now - position.updatedAt < 45000 && position.updatedAt <= now + 5000);
}
export function newerRiderPosition(current: RiderPosition | null, next: RiderPosition | null) {
  return next && (!current || (next.updatedAt ?? 0) >= (current.updatedAt ?? 0)) ? next : current;
}
