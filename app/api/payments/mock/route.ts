import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { amount?: number; method?: string; cardNumber?: string };
  if (!body.amount || !body.method) return NextResponse.json({ error: "Payment details are incomplete" }, { status: 400 });
  if (body.method === "card" && body.cardNumber?.replace(/\s/g, "") !== "4242424242424242") {
    return NextResponse.json({ id: `test_${Date.now()}`, status: "declined", mode: "test", amount: body.amount, message: "Use test card 4242 4242 4242 4242" });
  }
  return NextResponse.json({ id: `test_${Date.now()}`, status: "approved", mode: "test", amount: body.amount, message: "Test payment approved. No money was charged." });
}
