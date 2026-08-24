import { getProduct } from "@/lib/demo-data";
import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const partId = request.nextUrl.searchParams.get("partId") ?? "";
  const vehicleId = request.nextUrl.searchParams.get("vehicleId") ?? "";
  const product = getProduct(partId);
  if (!product) return NextResponse.json({ error: "Part not found" }, { status: 404 });
  const compatible = product.compatibleVehicleIds.includes(vehicleId);
  return NextResponse.json({ compatible, message: compatible ? "Fits your selected vehicle" : "This part is not verified for your selected vehicle" });
}
