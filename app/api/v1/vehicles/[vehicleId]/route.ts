import { findVehicleById } from "@/lib/vehicle-catalog";
import { corsJson, corsOptions } from "@/lib/api-cors";

export async function GET(request: Request, context: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await context.params;
  const vehicle = findVehicleById(decodeURIComponent(vehicleId));
  if (!vehicle) return corsJson(request, { success: false, error: "Vehicle not found." }, { status: 404 });
  return corsJson(request, { success: true, data: vehicle });
}

export const OPTIONS = corsOptions;
