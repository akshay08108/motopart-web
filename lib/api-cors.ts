import { NextResponse } from "next/server";

const allowedOrigins = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "https://motopart-web.vercel.app",
]);

function originFor(request: Request) {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins.has(origin) ? origin : null;
}

export function corsHeaders(request: Request) {
  const headers = new Headers({ Vary: "Origin" });
  const origin = originFor(request);
  if (!origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export function corsJson(request: Request, body: unknown, init?: ResponseInit) {
  const headers = corsHeaders(request);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

export function corsOptions(request: Request) {
  if (!originFor(request)) return new NextResponse(null, { status: 403, headers: corsHeaders(request) });
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
