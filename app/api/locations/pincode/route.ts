import { corsJson, corsOptions } from "@/lib/api-cors";
import { parsePostalOffices } from "@/lib/postal-address";

export async function GET(request: Request) {
  const pin = new URL(request.url).searchParams.get("pin") ?? "";
  if (!/^[1-9]\d{5}$/.test(pin)) return corsJson(request, { error: "Enter a valid six-digit Indian PIN code." }, { status: 400 });
  try {
    const response = await fetch(`https://searchpincode.in/api/pincode/${pin}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error();
    const offices = parsePostalOffices(await response.json());
    return corsJson(request, { pin, offices }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return corsJson(request, { error: "PIN lookup is unavailable. Retry or enter your full address manually." }, { status: 503 });
  }
}
export const OPTIONS = corsOptions;
