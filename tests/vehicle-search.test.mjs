import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/vehicle-catalog.ts", import.meta.url), "utf8");
const catalog = JSON.parse(await readFile(new URL("../data/partx-vehicle-catalog.json", import.meta.url), "utf8"));
const code = ts.transpileModule(source.replace('import catalogData from "@/data/partx-vehicle-catalog.json";', `const catalogData = ${JSON.stringify(catalog)};`), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { searchVehicles, findVehicleById } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const first = query => searchVehicles(query)[0];

test("partial and full names rank model matches first", () => {
  assert.equal(first("swi").model, "Swift");
  assert.equal(first("swift").model, "Swift");
  assert.equal(first("Maruti Suzuki Swift").model, "Swift");
  assert.equal(first("creta").model, "Creta");
  assert.equal(first("polo").make, "Volkswagen");
});
test("spacing, manufacturer aliases and punctuation are accepted", () => {
  assert.equal(first("altoK10").model, "Alto K10");
  assert.equal(first("VW polo").model, "Polo");
  assert.equal(first("MSIL Swift").model, "Swift");
  assert.equal(first("Suzuki Swift").model, "Swift");
  assert.equal(first("Tata Motors Nexon").model, "Nexon");
  assert.equal(first("  maruti-suzuki SWIFT ").vehicleModelId, first("swift").vehicleModelId);
});
test("only conservative single-word typos receive suggestions", () => {
  assert.equal(first("swfit").model, "Swift");
  assert.equal(first("swft").model, "Swift");
  assert.equal(first("cretta").model, "Creta");
  assert.equal(first("maruti swfit").model, "Swift");
  assert.equal(searchVehicles("sxw").length, 0);
  assert.equal(searchVehicles("zzzzzzzzz").length, 0);
  assert.equal(searchVehicles("marutx swfit").length, 0);
});
test("manufacturer is a strict filter, including aliases", () => {
  assert.ok(searchVehicles("", "VW").length > 0);
  assert.ok(searchVehicles("", "VW").every(car => car.make === "Volkswagen"));
  assert.ok(searchVehicles("", "Maruti Suzuki").every(car => car.make === "Maruti Suzuki"));
  assert.equal(searchVehicles("swift", "Hyundai").length, 0);
  assert.equal(searchVehicles("", "not a make").length, 0);
});
test("suggestions are bounded and preserve original catalogue identities", () => {
  assert.equal(searchVehicles("").length, 0);
  assert.equal(searchVehicles("", "Maruti Suzuki", 100).length, 8);
  assert.equal(searchVehicles("", "Maruti Suzuki", 3).length, 3);
  for (const car of searchVehicles("", "Maruti Suzuki")) {
    const record = findVehicleById(car.vehicleModelId);
    assert.equal(record.model, car.model);
    assert.equal(record.make, car.make);
    assert.equal(car.displayName, `${car.make} ${car.model}`);
    assert.equal(record.yearFrom, null);
  }
});
