import { NextResponse } from "next/server";
import { findVehicleById } from "@/lib/vehicle-catalog";

export async function GET(_request: Request, context: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await context.params;
  const vehicle = findVehicleById(decodeURIComponent(vehicleId));
  if (!vehicle) return NextResponse.json({ success: false, error: "Vehicle not found." }, { status: 404 });
  return NextResponse.json({ success: true, data: vehicle });
}
