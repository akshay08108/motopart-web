import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { productId?: string; quantity?: number };
  return NextResponse.json({ id: "demo-cart", productId: body.productId, quantity: body.quantity ?? 1, status: "saved" }, { status: 201 });
}
