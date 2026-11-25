import catalogData from "@/data/partx-vehicle-catalog.json";

export type VehicleMakeRecord = {
  id: string;
  name: string;
};

export type VehicleModelRecord = {
  vehicleModelId: string;
  makeId: string;
  make: string;
  model: string;
  market: string;
  referencePeriod: string;
  generation: string | null;
  yearFrom: number | null;
  yearTo: number | null;
};

export type VehicleVariantGuideRecord = {
  vehicleModelId: string;
  make: string;
  model: string;
  fuelTypes: string[];
  trimLadder: string;
  generation: string | null;
  yearFrom: number | null;
  yearTo: number | null;
};

export type VehicleSearchRecord = Pick<VehicleModelRecord, "vehicleModelId" | "make" | "model"> & {
  displayName: string;
};

const makes = catalogData.makes as VehicleMakeRecord[];
const models = catalogData.models as VehicleModelRecord[];
const variantGuides = catalogData.variantGuides as VehicleVariantGuideRecord[];

export function listVehicleMakes() {
  return makes;
}

export function listVehicleModels(make: string) {
  const normalizedMake = normalize(make);
  if (!normalizedMake) return [];
  return models.filter((vehicle) => normalize(vehicle.make) === normalizedMake);
}

export function listVehicleVariants(make: string, model: string) {
  const normalizedMake = normalize(make);
  const normalizedModel = normalize(model);
  if (!normalizedMake || !normalizedModel) return [];
  return variantGuides.filter((guide) => normalize(guide.make) === normalizedMake && normalize(guide.model) === normalizedModel);
}

export function findVehicleById(vehicleModelId: string) {
  const vehicle = models.find((model) => model.vehicleModelId === vehicleModelId);
  if (!vehicle) return null;
  const variants = variantGuides.filter((guide) => guide.vehicleModelId === vehicle.vehicleModelId
    || (normalize(guide.make) === normalize(vehicle.make) && normalize(guide.model) === normalize(vehicle.model)));
  return { ...vehicle, variants };
}

export function searchVehicles(query: string, make = "", limit = 8): VehicleSearchRecord[] {
  const normalizedQuery = canonicalQuery(query);
  const normalizedMake = canonicalQuery(make);
  if (!normalizedQuery && !normalizedMake) return [];

  return models
    .filter((vehicle) => !normalizedMake || canonicalQuery(vehicle.make) === normalizedMake)
    .map((vehicle) => ({ vehicle, rank: searchRank(vehicle, normalizedQuery) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((left, right) => left.rank - right.rank
      || left.vehicle.make.localeCompare(right.vehicle.make)
      || left.vehicle.model.localeCompare(right.vehicle.model))
    .slice(0, Math.max(1, Math.min(limit, 8)))
    .map(({ vehicle }) => ({
      vehicleModelId: vehicle.vehicleModelId,
      make: vehicle.make,
      model: vehicle.model,
      displayName: `${vehicle.make} ${vehicle.model}`,
    }));
}

function canonicalQuery(value: string) {
  return normalize(value)
    .replace(/\b(maruti suzuki|maruti|suzuki|msil)\b/g, "maruti suzuki")
    .replace(/\b(vw|volkswagen)\b/g, "volkswagen")
    .replace(/\b(mercedes benz|mercedes|merc)\b/g, "mercedes benz")
    .replace(/\b(tata motors)\b/g, "tata")
    .replace(/\b(m m)\b/g, "mahindra");
}

function searchRank(vehicle: VehicleModelRecord, query: string) {
  if (!query) return 4;
  const model = normalize(vehicle.model);
  const displayName = canonicalQuery(`${vehicle.make} ${vehicle.model}`);
  const compactQuery = query.replaceAll(" ", "");
  const compactModel = model.replaceAll(" ", "");
  const compactName = displayName.replaceAll(" ", "");
  if (compactModel === compactQuery || compactName === compactQuery) return 0;
  if (compactModel.startsWith(compactQuery)) return 1;
  if (compactName.startsWith(compactQuery)) return 2;
  const terms = query.split(" ");
  if (terms.every((term) => displayName.includes(term))) return 3;
  const words = displayName.split(" ");
  // One small edit in one word only; short tokens must still match exactly.
  let corrections = 0;
  for (const term of terms) {
    if (words.some((word) => word.startsWith(term))) continue;
    if (term.length < 4 || !words.some((word) => oneEditApart(term, word))) return Infinity;
    corrections++;
  }
  return corrections === 1 ? 5 + model.length / 1000 : Infinity;
}

function oneEditApart(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const differences = [...left].map((letter, index) => letter === right[index] ? -1 : index).filter((index) => index >= 0);
    return differences.length === 1 || (differences.length === 2
      && differences[1] === differences[0] + 1
      && left[differences[0]] === right[differences[1]]
      && left[differences[1]] === right[differences[0]]);
  }
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let index = 0;
  while (index < shorter.length && shorter[index] === longer[index]) index++;
  return shorter.slice(index) === longer.slice(index + 1);
}

export function normalizeVehicleQuery(value: string) {
  return normalize(value).slice(0, 80);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
