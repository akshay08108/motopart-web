import { demoGarages } from "@/lib/marketplace-data";
import type { Garage } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(demoGarages);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<Garage>;
  if (!body.name || !body.phone || !body.location?.address) {
    return NextResponse.json({ error: "Garage name, phone and location are required" }, { status: 400 });
  }
  return NextResponse.json({ ...body, id: `garage-${Date.now()}`, distanceKm: 0 } as Garage, { status: 201 });
}
