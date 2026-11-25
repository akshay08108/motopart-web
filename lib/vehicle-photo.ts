import photos from "@/data/vehicle-photos.json";
import type { Vehicle } from "@/lib/types";

type VehicleIdentity = Pick<Vehicle, "make" | "model" | "vehicleModelId">;
export type VehiclePhotoRecord = {
  make: string;
  model: string;
  src: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  referenceOnly: boolean;
};
const registry: Record<string, VehiclePhotoRecord> = photos;
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

// Explicit model mapping only. Never guess a photo from a similar model name.
export function vehiclePhoto(vehicle: VehicleIdentity): VehiclePhotoRecord | null {
  if (vehicle.vehicleModelId) {
    const photo = registry[vehicle.vehicleModelId];
    return photo && normalize(photo.make) === normalize(vehicle.make) && normalize(photo.model) === normalize(vehicle.model) ? photo : null;
  }
  return Object.values(registry).find((photo) => normalize(photo.make) === normalize(vehicle.make)
    && normalize(photo.model) === normalize(vehicle.model)) ?? null;
}
