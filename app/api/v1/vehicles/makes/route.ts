import { NextResponse } from "next/server";
import { listVehicleMakes } from "@/lib/vehicle-catalog";

export function GET() {
  return NextResponse.json({ success: true, data: listVehicleMakes() });
}
