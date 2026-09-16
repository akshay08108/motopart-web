import { NextRequest } from "next/server";
import { listVehicleModels, normalizeVehicleQuery } from "@/lib/vehicle-catalog";
import { corsJson, corsOptions } from "@/lib/api-cors";

export function GET(request: NextRequest) {
  const make = normalizeVehicleQuery(request.nextUrl.searchParams.get("make") ?? "");
  if (!make) return corsJson(request, { success: false, error: "The make query parameter is required." }, { status: 400 });
  return corsJson(request, { success: true, data: listVehicleModels(make) });
}

export const OPTIONS = corsOptions;
