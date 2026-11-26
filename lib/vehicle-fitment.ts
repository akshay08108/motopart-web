import type { Product, Vehicle } from "./types";

/** Only explicit catalogue links establish a model match; names and entered details do not. */
export function matchesVehicle(product: Pick<Product, "compatibleVehicleIds">, vehicle?: Vehicle): boolean {
  if (!vehicle) return false;
  return product.compatibleVehicleIds.includes(vehicle.id)
    || Boolean(vehicle.vehicleModelId && product.compatibleVehicleIds.includes(vehicle.vehicleModelId));
}
