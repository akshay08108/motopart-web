import type { Vehicle } from "@/lib/types";

export function vehicleName(vehicle: Vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

export function vehicleDetails(vehicle: Vehicle) {
  return [vehicle.variant, vehicle.fuel, vehicle.transmission].filter(Boolean).join(" · ") || "Model saved for fitment";
}
