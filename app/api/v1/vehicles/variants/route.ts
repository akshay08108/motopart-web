import { NextRequest } from "next/server";
import { listVehicleVariants, normalizeVehicleQuery } from "@/lib/vehicle-catalog";
import { corsJson, corsOptions } from "@/lib/api-cors";

export function GET(request: NextRequest) {
  const make = normalizeVehicleQuery(request.nextUrl.searchParams.get("make") ?? "");
  const model = normalizeVehicleQuery(request.nextUrl.searchParams.get("model") ?? "");
  if (!make || !model) return corsJson(request, { success: false, error: "The make and model query parameters are required." }, { status: 400 });
  return corsJson(request, { success: true, data: listVehicleVariants(make, model) });
}

export const OPTIONS = corsOptions;
