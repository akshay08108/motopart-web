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

export function searchVehicles(query: string, make = "", limit = 30): VehicleSearchRecord[] {
  const normalizedQuery = normalize(query);
  const normalizedMake = normalize(make);
  const terms = normalizedQuery.split(" ").filter(Boolean);

  return models
    .filter((vehicle) => {
      if (normalizedMake && normalize(vehicle.make) !== normalizedMake) return false;
      if (!terms.length) return Boolean(normalizedMake);
      const haystack = normalize(`${vehicle.make} ${vehicle.model}`);
      return terms.every((term) => haystack.includes(term));
    })
    .map((vehicle) => ({
      vehicle,
      rank: searchRank(vehicle, normalizedQuery),
    }))
    .sort((left, right) => left.rank - right.rank
      || left.vehicle.make.localeCompare(right.vehicle.make)
      || left.vehicle.model.localeCompare(right.vehicle.model))
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map(({ vehicle }) => ({
      vehicleModelId: vehicle.vehicleModelId,
      make: vehicle.make,
      model: vehicle.model,
      displayName: `${vehicle.make} ${vehicle.model}`,
    }));
}

function searchRank(vehicle: VehicleModelRecord, query: string) {
  if (!query) return 4;
  const model = normalize(vehicle.model);
  const displayName = normalize(`${vehicle.make} ${vehicle.model}`);
  if (model === query) return 0;
  if (model.startsWith(query)) return 1;
  if (displayName.startsWith(query)) return 2;
  return 3;
}

export function normalizeVehicleQuery(value: string) {
  return normalize(value).slice(0, 80);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
