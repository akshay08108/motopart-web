import { NextRequest, NextResponse } from "next/server";
import { normalizeVehicleQuery, searchVehicles } from "@/lib/vehicle-catalog";

export function GET(request: NextRequest) {
  const query = normalizeVehicleQuery(request.nextUrl.searchParams.get("q") ?? "");
  const make = normalizeVehicleQuery(request.nextUrl.searchParams.get("make") ?? "");
  if (!make && query.length < 2) {
    return NextResponse.json({ success: false, error: "Enter at least 2 characters or choose a make." }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: searchVehicles(query, make) });
}
