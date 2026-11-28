type PartType = {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly match: RegExp;
};

type Category = {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly children: readonly PartType[];
};

export const categoryPhotos = {
  brakes: "/categories/brake-disc.webp",
  filters: "/categories/air-filter.webp",
  batteries: "/categories/battery.webp",
  electrical: "/categories/headlamp.webp",
  suspension: "/categories/suspension.webp",
  engine: "/categories/engine.webp",
  ignition: "/categories/spark-plug.webp",
  body: "/categories/wipers.webp",
  fluids: "/categories/service-fluids.webp",
  oilFilters: "/categories/oil-filter.webp",
  cooling: "/categories/radiator.webp",
  transmission: "/categories/clutch.webp",
  accessories: "/categories/fasteners.webp",
  other: "/categories/assorted-parts.webp",
} as const;

export const partCategories: readonly Category[] = [
  {
    id: "brakes", name: "Brakes", image: categoryPhotos.brakes, children: [
      { id: "pads", name: "Brake pads & shoes", image: "/categories/subcategories/pads.webp", match: /\bbrake (pads?|shoes?)\b/ },
      { id: "discs", name: "Discs & drums", image: categoryPhotos.brakes, match: /\bbrake (discs?|rotors?|drums?)\b|\bdrum brakes?\b/ },
      { id: "brake-hydraulics", name: "Calipers & hydraulics", image: "/categories/subcategories/brake-hydraulics.webp", match: /\b(brake calipers?|brake hoses?|brake master cylinders?)\b/ },
      { id: "abs", name: "ABS components", image: "/categories/subcategories/abs.webp", match: /\babs (sensors?|pumps?|rings?|modules?)\b/ },
    ],
  },
  {
    id: "filters", name: "Filters", image: categoryPhotos.filters, children: [
      { id: "cabin-filters", name: "Cabin filters", image: "/categories/subcategories/cabin-filters.webp", match: /\b(cabin( air)?|pollen|ac) filters?\b/ },
      { id: "air-filters", name: "Air filters", image: categoryPhotos.filters, match: /\bair filters?\b/ },
      { id: "oil-filters", name: "Oil filters", image: categoryPhotos.oilFilters, match: /\boil filters?\b/ },
      { id: "fuel-filters", name: "Fuel filters", image: "/categories/subcategories/fuel-filters.webp", match: /\bfuel filters?\b/ },
      { id: "transmission-filters", name: "Transmission filters", image: "/categories/subcategories/transmission-filters.webp", match: /\b(gearbox|transmission) filters?\b/ },
    ],
  },
  {
    id: "engine", name: "Engine & ignition", image: categoryPhotos.engine, children: [
      { id: "belts", name: "Belts & timing", image: "/categories/subcategories/belts.webp", match: /\b(timing (belts?|chains?|kits?)|(drive|serpentine|fan|v) belts?|belt tensioners?)\b/ },
      { id: "ignition", name: "Spark plugs & ignition", image: categoryPhotos.ignition, match: /\b(spark plugs?|glow plugs?|ignition coils?|ignition leads?)\b/ },
      { id: "fuel-system", name: "Fuel system", image: "/categories/subcategories/fuel-system.webp", match: /\b(fuel pumps?|fuel injectors?|injector nozzles?|throttle bod(y|ies))\b/ },
      { id: "engine-internals", name: "Engine internals & seals", image: "/categories/subcategories/engine-internals.webp", match: /\b(pistons?|crankshafts?|camshafts?|head gaskets?|valve cover gaskets?|engine mounts?)\b/ },
    ],
  },
  {
    id: "suspension", name: "Steering & suspension", image: categoryPhotos.suspension, children: [
      { id: "shocks", name: "Shock absorbers & struts", image: categoryPhotos.suspension, match: /\b(shock absorbers?|struts?|dampers?)\b/ },
      { id: "suspension-links", name: "Springs, arms & joints", image: "/categories/subcategories/suspension-links.webp", match: /\b(coil springs?|control arms?|ball joints?|stabili[sz]ers?( links?)?|suspension bush(es|ings?))\b/ },
      { id: "steering", name: "Steering components", image: "/categories/subcategories/steering.webp", match: /\b(tie rod ends?|steering racks?|power steering pumps?)\b/ },
      { id: "bearings", name: "Wheel bearings & hubs", image: "/categories/subcategories/bearings.webp", match: /\bwheel (bearings?|hubs?)\b/ },
    ],
  },
  {
    id: "electrical", name: "Electrical & lighting", image: categoryPhotos.electrical, children: [
      { id: "batteries", name: "Batteries", image: categoryPhotos.batteries, match: /\b(batter(y|ies)|accumulators?)\b/ },
      { id: "lighting", name: "Lights & bulbs", image: categoryPhotos.electrical, match: /\b(headlights?|headlamps?|tail lights?|fog (lights?|lamps?)|bulbs?|indicators?)\b/ },
      { id: "charging", name: "Starters & alternators", image: "/categories/subcategories/charging.webp", match: /\b(starter motors?|alternators?)\b/ },
      { id: "electrical-sensors", name: "Sensors, switches & fuses", image: "/categories/subcategories/electrical-sensors.webp", match: /\b(sensors?|switches?|fuses?|relays?|wiring harness(es)?)\b/ },
    ],
  },
  {
    id: "fluids", name: "Oils & fluids", image: categoryPhotos.fluids, children: [
      { id: "engine-oil", name: "Engine oil", image: "/categories/subcategories/engine-oil.webp", match: /\b(engine ?oils?|motor oils?|lubricating oil)\b|\b\d{1,2}w ?\d{2}\b/ },
      { id: "coolant", name: "Coolant & antifreeze", image: "/categories/subcategories/coolant.webp", match: /\b(coolants?|antifreeze)\b(?! (hoses?|sensors?|pumps?|reservoirs?|tanks?|caps?))/ },
      { id: "brake-fluid", name: "Brake fluid", image: "/categories/subcategories/brake-fluid.webp", match: /\bbrake fluid\b(?! (reservoirs?|tanks?|caps?))/ },
      { id: "transmission-fluid", name: "Transmission fluid & gear oil", image: "/categories/subcategories/transmission-fluid.webp", match: /\b(transmission fluid|gear ?(oil|fluid)|atf|cvt fluid)\b/ },
      { id: "power-steering-fluid", name: "Power steering fluid", image: "/categories/subcategories/power-steering-fluid.webp", match: /\b(power )?steering (fluid|oil)\b/ },
      { id: "def", name: "Diesel exhaust fluid (DEF)", image: "/categories/subcategories/def.webp", match: /\b(diesel exhaust fluid|def|ad ?blue)\b(?! (pumps?|injectors?|sensors?|tanks?))/ },
    ],
  },
  {
    id: "cooling", name: "Cooling & air conditioning", image: categoryPhotos.cooling, children: [
      { id: "radiators", name: "Radiators, fans & hoses", image: categoryPhotos.cooling, match: /\b(radiators?|coolant hoses?|cooling fans?|radiator fans?)\b/ },
      { id: "water-pumps", name: "Water pumps & thermostats", image: "/categories/subcategories/water-pumps.webp", match: /\b(water pumps?|coolant pumps?|thermostats?)\b/ },
      { id: "air-conditioning", name: "A/C compressors & condensers", image: "/categories/subcategories/air-conditioning.webp", match: /\b(ac compressors?|a c compressors?|air conditioning compressors?|condensers?|evaporators?)\b/ },
    ],
  },
  {
    id: "transmission", name: "Clutch & transmission", image: categoryPhotos.transmission, children: [
      { id: "clutch", name: "Clutch kits & components", image: categoryPhotos.transmission, match: /\b(clutch|flywheels?)\b/ },
      { id: "gearbox", name: "Gearbox components", image: "/categories/subcategories/gearbox.webp", match: /\b(gearbox(es)?|transmission mounts?|shift cables?|synchros?)\b/ },
      { id: "drivetrain", name: "Drive shafts & CV joints", image: "/categories/subcategories/drivetrain.webp", match: /\b(drive ?shafts?|cv joints?|cv boots?|differentials?)\b/ },
    ],
  },
  {
    id: "body", name: "Body & visibility", image: categoryPhotos.body, children: [
      { id: "wipers", name: "Wipers & washers", image: categoryPhotos.body, match: /\b(wipers?|windscreen washers?|washer pumps?|washer nozzles?)\b/ },
      { id: "panels", name: "Body panels & bumpers", image: "/categories/subcategories/panels.webp", match: /\b(bumpers?|fenders?|bonnets?|body panels?)\b/ },
      { id: "mirrors", name: "Mirrors & glass", image: "/categories/subcategories/mirrors.webp", match: /\b(mirrors?|windscreens?|windshields?|window glass)\b/ },
    ],
  },
  {
    id: "accessories", name: "Hardware & accessories", image: categoryPhotos.accessories, children: [
      { id: "fasteners", name: "Bolts, nuts & clips", image: categoryPhotos.accessories, match: /\b(bolts?|fasteners?|screws?|nuts?|retaining clips?)\b/ },
      { id: "interior", name: "Interior accessories", image: "/categories/subcategories/interior.webp", match: /\b(floor mats?|seat covers?|phone holders?)\b/ },
      { id: "tools", name: "Tools & workshop supplies", image: "/categories/subcategories/tools.webp", match: /\b(tool kits?|spanners?|trolley jacks?|torque wrenches?)\b/ },
    ],
  },
  { id: "other", name: "Other parts", image: categoryPhotos.other, children: [] },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const groupsByLabel = new Map(partCategories.flatMap((group) => [[normalize(group.name), group], [normalize(group.id), group]] as const));
const inferenceGroups = [...partCategories.filter(({ id }) => id === "filters" || id === "fluids"), ...partCategories.filter(({ id }) => id !== "filters" && id !== "fluids")];
const legacy: Record<string, { category: string; subcategory?: string }> = {
  batteries: { category: "electrical", subcategory: "batteries" },
  ignition: { category: "engine", subcategory: "ignition" },
  "engine oil": { category: "fluids", subcategory: "engine-oil" },
  lubricants: { category: "fluids" },
  lighting: { category: "electrical", subcategory: "lighting" },
  steering: { category: "suspension", subcategory: "steering" },
  wipers: { category: "body", subcategory: "wipers" },
  "oil filters": { category: "filters", subcategory: "oil-filters" },
};

export function categorySelection(category: string | null, subcategory?: string | null) {
  const key = normalize(category ?? "");
  const old = Object.hasOwn(legacy, key) ? legacy[key] : undefined;
  const group = groupsByLabel.get(old?.category ?? key);
  if (!group) return { category: "", subcategory: "" };
  const type = normalize(subcategory ?? old?.subcategory ?? "");
  return {
    category: group.id,
    subcategory: group.children.find((child) => normalize(child.id) === type || normalize(child.name) === type)?.id ?? "",
  };
}

export function categorizePart(product: { category: string; name: string; subcategory?: string }) {
  const saved = categorySelection(product.category, product.subcategory);
  if (saved.subcategory) return saved;
  const name = normalize(product.name);
  const group = partCategories.find((item) => item.id === saved.category);
  const inGroup = group?.children.find((item) => item.match.test(name));
  if (inGroup && inGroup.id !== "electrical-sensors") return { category: saved.category, subcategory: inGroup.id };

  // Some older categories covered several systems. Only infer from the name for those broad labels.
  const broadLegacy = ["engine", "electrical", "accessories", "other", "brakes", "suspension", "fluids", "lubricants"].includes(normalize(product.category));
  if (!group || broadLegacy) {
    // Treat fluids before broad electrical names such as “power steering”; keep named filters distinct from oils.
    for (const category of inferenceGroups) {
      const child = category.children.find((item) => item.match.test(name));
      if (child && child.id !== "electrical-sensors") return { category: category.id, subcategory: child.id };
    }
  }

  if (inGroup) return { category: saved.category, subcategory: inGroup.id };
  const electrical = inferenceGroups.find(({ id }) => id === "electrical");
  if (!group && electrical?.children.some((type) => type.match.test(name))) return { category: electrical.id, subcategory: "electrical-sensors" };
  return { category: saved.category || "other", subcategory: "" };
}

export function categoryHref(category: string, subcategory = "") {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (subcategory) params.set("subcategory", subcategory);
  return params.size ? `/shop?${params}` : "/shop";
}
