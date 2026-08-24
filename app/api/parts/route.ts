import { getDemoCatalog } from "@/lib/demo-data";
import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query") ?? "";
  const category = request.nextUrl.searchParams.get("category") ?? "All";
  return NextResponse.json(getDemoCatalog(query, category));
}
