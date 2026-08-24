import { demoOffers } from "@/lib/marketplace-data";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(demoOffers);
}
