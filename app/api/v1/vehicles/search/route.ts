import { NextRequest } from "next/server";
import { normalizeVehicleQuery, searchVehicles } from "@/lib/vehicle-catalog";
import { corsJson, corsOptions } from "@/lib/api-cors";

export function GET(request: NextRequest) {
  const query = normalizeVehicleQuery(request.nextUrl.searchParams.get("q") ?? "");
  const make = normalizeVehicleQuery(request.nextUrl.searchParams.get("make") ?? "");
  if (!make && query.length < 2) {
    return corsJson(request, { success: false, error: "Enter at least 2 characters or choose a make." }, { status: 400 });
  }
  return corsJson(request, { success: true, data: searchVehicles(query, make) });
}

export const OPTIONS = corsOptions;
