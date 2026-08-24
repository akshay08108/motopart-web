import { activeOrder } from "@/lib/demo-data";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json([activeOrder]);
}
