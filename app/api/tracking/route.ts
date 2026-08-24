import { activeOrder } from "@/lib/demo-data";
import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId") ?? activeOrder.id;
  return NextResponse.json({ ...activeOrder, id: orderId });
}
