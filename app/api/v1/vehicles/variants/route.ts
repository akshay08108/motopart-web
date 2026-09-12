import { NextRequest, NextResponse } from "next/server";
import { listVehicleVariants, normalizeVehicleQuery } from "@/lib/vehicle-catalog";

export function GET(request: NextRequest) {
  const make = normalizeVehicleQuery(request.nextUrl.searchParams.get("make") ?? "");
  const model = normalizeVehicleQuery(request.nextUrl.searchParams.get("model") ?? "");
  if (!make || !model) return NextResponse.json({ success: false, error: "The make and model query parameters are required." }, { status: 400 });
  return NextResponse.json({ success: true, data: listVehicleVariants(make, model) });
}
