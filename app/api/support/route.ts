import type { SupportIssueType } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { orderId?: string; issueType?: SupportIssueType; message?: string };
  if (!body.orderId || !body.issueType || !body.message?.trim()) {
    return NextResponse.json({ error: "Order, issue type and message are required" }, { status: 400 });
  }
  return NextResponse.json({
    id: `MPS-${Date.now().toString().slice(-7)}`,
    orderId: body.orderId,
    issueType: body.issueType,
    message: body.message.trim(),
    status: "open",
    createdAt: new Date().toISOString(),
  }, { status: 201 });
}
