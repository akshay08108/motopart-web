import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const CARVECTOR_API_URL = "https://api.carvector.io/v1/vehicles";

type CarVectorVehicle = {
  id?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string | null;
  submodel?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
  drive_type?: string | null;
  cylinders?: number | null;
  displacement_l?: number | null;
  body_class?: string | null;
  horsepower?: number | null;
  image_url?: string | null;
};

type CarVectorSearchResponse = {
  count?: number;
  limit?: number;
  offset?: number;
  results?: CarVectorVehicle[];
};

export type VehicleSearchResult = {
  id: string;
  make: string;
  model: string;
  year: number;
  variant: string;
  fuel: string;
  transmission: string;
  drive?: string;
  cylinders?: number;
  displacement?: number;
  imageUrl?: string;
};

export async function GET(request: NextRequest) {
  const apiKey = process.env.CARVECTOR_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Vehicle search is not configured yet. Add CARVECTOR_API_KEY to the server environment." },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim() ?? "";
  const make = params.get("make")?.trim() ?? "";
  const year = params.get("year")?.trim() ?? "";

  if (!query && !make) return NextResponse.json({ results: [] });

  const upstream = new URL(CARVECTOR_API_URL);
  if (make) upstream.searchParams.set("make", make);
  if (query) upstream.searchParams.set("model", query);
  if (year && /^\d{4}$/.test(year)) upstream.searchParams.set("year", year);
  upstream.searchParams.set("limit", "50");
  upstream.searchParams.set("offset", "0");

  try {
    const response = await fetch(upstream, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("CarVector vehicle search failed", response.status, detail.slice(0, 300));

      if (response.status === 401) {
        return NextResponse.json({ error: "CarVector authentication failed. Check CARVECTOR_API_KEY." }, { status: 502 });
      }
      if (response.status === 429) {
        return NextResponse.json({ error: "Vehicle search limit reached. Please try again shortly." }, { status: 429 });
      }
      if (response.status === 403) {
        return NextResponse.json({ error: "Your CarVector plan does not allow this vehicle request." }, { status: 502 });
      }

      return NextResponse.json({ error: "Vehicle search is temporarily unavailable." }, { status: 502 });
    }

    const body = await response.json() as CarVectorSearchResponse;
    const vehicles = Array.isArray(body.results) ? body.results : [];
    const seen = new Set<string>();
    const results: VehicleSearchResult[] = [];

    for (const vehicle of vehicles) {
      const normalized = normalizeVehicle(vehicle);
      if (!normalized) continue;
      const dedupeKey = `${normalized.id}|${normalized.make}|${normalized.model}|${normalized.year}`.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      results.push(normalized);
      if (results.length >= 30) break;
    }

    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    console.error("CarVector request failed", error);
    return NextResponse.json({ error: "Vehicle search is temporarily unavailable." }, { status: 502 });
  }
}

function normalizeVehicle(vehicle: CarVectorVehicle): VehicleSearchResult | null {
  const id = clean(vehicle.id);
  const make = clean(vehicle.make);
  const model = clean(vehicle.model);
  const year = Number(vehicle.year);
  if (!id || !make || !model || !Number.isInteger(year)) return null;

  const trim = clean(vehicle.trim);
  const submodel = clean(vehicle.submodel);
  const engine = vehicle.displacement_l ? `${Number(vehicle.displacement_l).toFixed(1)}L` : "";
  const cylinderLabel = vehicle.cylinders ? `${vehicle.cylinders}-cyl` : "";
  const bodyClass = clean(vehicle.body_class);
  const variant = [trim, submodel, engine, cylinderLabel, bodyClass].filter(Boolean).join(" · ") || "Standard";

  const fuel = clean(vehicle.fuel_type);
  const transmission = clean(vehicle.transmission);
  const drive = clean(vehicle.drive_type);
  const imageUrl = clean(vehicle.image_url);

  return {
    id,
    make,
    model,
    year,
    variant,
    fuel: fuel || "Not specified",
    transmission: transmission || "Not specified",
    ...(drive ? { drive } : {}),
    ...(vehicle.cylinders ? { cylinders: Number(vehicle.cylinders) } : {}),
    ...(vehicle.displacement_l ? { displacement: Number(vehicle.displacement_l) } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
