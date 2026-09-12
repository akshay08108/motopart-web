import { NextRequest, NextResponse } from "next/server";
import { listVehicleModels, normalizeVehicleQuery } from "@/lib/vehicle-catalog";

export function GET(request: NextRequest) {
  const make = normalizeVehicleQuery(request.nextUrl.searchParams.get("make") ?? "");
  if (!make) return NextResponse.json({ success: false, error: "The make query parameter is required." }, { status: 400 });
  return NextResponse.json({ success: true, data: listVehicleModels(make) });
}
