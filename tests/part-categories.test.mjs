import assert from "node:assert/strict";
import { test } from "node:test";
import { categorizePart, categoryHref, categorySelection } from "../lib/part-categories.ts";

test("old category links resolve to the equivalent group and part type", () => {
  assert.deepEqual(categorySelection("Batteries"), { category: "electrical", subcategory: "batteries" });
  assert.deepEqual(categorySelection("Engine Oil"), { category: "fluids", subcategory: "engine-oil" });
  assert.deepEqual(categorySelection("Fluids"), { category: "fluids", subcategory: "" });
  assert.deepEqual(categorySelection("filters", "Brake pads & shoes"), { category: "filters", subcategory: "" });
  assert.equal(categoryHref("brakes", "pads"), "/shop?category=brakes&subcategory=pads");
});

test("existing listings are organized by specific labels and product names", () => {
  for (const [name, category, group, type] of [
    ["Front Disc Brake Pad Set", "Brakes", "brakes", "pads"],
    ["Cabin Air Filter", "Filters", "filters", "cabin-filters"],
    ["High-flow Engine Air Filter", "Filters", "filters", "air-filters"],
    ["Spin-on Engine Oil Filter", "Filters", "filters", "oil-filters"],
    ["EngineOil 3.5L", "Engine", "fluids", "engine-oil"],
    ["ABS Sensor", "Electrical", "brakes", "abs"],
    ["Radiator Coolant Hose", "Other", "cooling", "radiators"],
    ["M10 Flanged Bolt", "Shop hardware", "accessories", "fasteners"],
    ["Aerotwin Wiper Blade Set", "Accessories", "body", "wipers"],
  ]) {
    assert.deepEqual(categorizePart({ name, category }), { category: group, subcategory: type }, name);
  }
});

test("a seller's valid part type takes priority and unidentified listings remain visible", () => {
  assert.deepEqual(categorizePart({ name: "Air filter", category: "Filters", subcategory: "cabin-filters" }), {
    category: "filters", subcategory: "cabin-filters",
  });
  assert.deepEqual(categorizePart({ name: "Part A123", category: "Unknown" }), { category: "other", subcategory: "" });
});
