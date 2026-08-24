import { activeOrder } from "@/lib/demo-data";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { address?: string; delivery?: string; payment?: string; productIds?: string[] };
  if (!body.address || !body.delivery || !body.payment || !body.productIds?.length) {
    return NextResponse.json({ error: "Checkout details are incomplete" }, { status: 400 });
  }
  return NextResponse.json({ ...activeOrder, id: `MP${Date.now().toString().slice(-8)}`, stage: "Confirmed" }, { status: 201 });
}
