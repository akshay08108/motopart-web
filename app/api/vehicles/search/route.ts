import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const CARS_API_URL = "https://api.api-ninjas.com/v1/cars";

type ApiNinjasCar = {
  make?: string;
  model?: string;
  year?: number;
  class?: string;
  fuel_type?: string;
  transmission?: string;
  drive?: string;
  cylinders?: number;
  displacement?: number;
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
};

export async function GET(request: NextRequest) {
  const apiKey = process.env.CARS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Vehicle search is not configured yet. Add CARS_API_KEY to the server environment." },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim() ?? "";
  const make = params.get("make")?.trim() ?? "";
  const year = params.get("year")?.trim() ?? "";

  if (!query && !make) {
    return NextResponse.json({ results: [] });
  }

  const upstream = new URL(CARS_API_URL);
  if (make) upstream.searchParams.set("make", make);
  if (query) upstream.searchParams.set("model", query);
  if (year && /^\d{4}$/.test(year)) upstream.searchParams.set("year", year);

  try {
    const response = await fetch(upstream, {
      headers: { "X-Api-Key": apiKey },
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Cars API search failed", response.status, detail.slice(0, 300));
      return NextResponse.json(
        { error: response.status === 429 ? "Vehicle search limit reached. Please try again shortly." : "Vehicle search is temporarily unavailable." },
        { status: response.status === 429 ? 429 : 502 },
      );
    }

    const cars = await response.json() as ApiNinjasCar[];
    const seen = new Set<string>();
    const results: VehicleSearchResult[] = [];

    for (const car of cars) {
      const normalized = normalizeCar(car);
      if (!normalized) continue;
      const dedupeKey = `${normalized.make}|${normalized.model}|${normalized.year}|${normalized.variant}|${normalized.fuel}|${normalized.transmission}`.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      results.push(normalized);
      if (results.length >= 20) break;
    }

    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
  } catch (error) {
    console.error("Cars API request failed", error);
    return NextResponse.json({ error: "Vehicle search is temporarily unavailable." }, { status: 502 });
  }
}

function normalizeCar(car: ApiNinjasCar): VehicleSearchResult | null {
  const make = clean(car.make);
  const model = clean(car.model);
  const year = Number(car.year);
  if (!make || !model || !Number.isInteger(year)) return null;

  const engine = car.displacement ? `${Number(car.displacement).toFixed(1)}L` : "";
  const cylinderLabel = car.cylinders ? `${car.cylinders}-cyl` : "";
  const classLabel = clean(car.class);
  const variant = [engine, cylinderLabel, classLabel].filter(Boolean).join(" · ") || "Standard";
  const transmission = String(car.transmission ?? "").toLowerCase();
  const fuel = clean(car.fuel_type);
  const drive = clean(car.drive);

  return {
    id: slug(`${make}-${model}-${year}-${variant}-${fuel}-${transmission}`),
    make,
    model,
    year,
    variant,
    fuel: fuel ? titleCase(fuel.replaceAll("_", " ")) : "Not specified",
    transmission: transmission === "a" ? "Automatic" : transmission === "m" ? "Manual" : transmission ? titleCase(transmission) : "Not specified",
    ...(drive ? { drive: drive.toUpperCase() } : {}),
    ...(car.cylinders ? { cylinders: Number(car.cylinders) } : {}),
    ...(car.displacement ? { displacement: Number(car.displacement) } : {}),
  };
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}
