import { listVehicleMakes } from "@/lib/vehicle-catalog";
import { corsJson, corsOptions } from "@/lib/api-cors";

export function GET(request: Request) {
  return corsJson(request, { success: true, data: listVehicleMakes() });
}

export const OPTIONS = corsOptions;
