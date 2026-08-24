import { demoStores } from "@/lib/marketplace-data";
import type { PartnerStore } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(demoStores);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<PartnerStore>;
  if (!body.name || !body.owner || !body.phone || !body.location?.address || !body.listings?.length) {
    return NextResponse.json({ error: "Store, location and at least one product are required" }, { status: 400 });
  }
  return NextResponse.json({ ...body, id: `store-${Date.now()}`, rating: 5, distanceKm: 0 } as PartnerStore, { status: 201 });
}
