import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, access } from "node:fs/promises";
import ts from "typescript";

const photos = JSON.parse(await readFile(new URL("../data/vehicle-photos.json", import.meta.url), "utf8"));
const catalog = JSON.parse(await readFile(new URL("../data/partx-vehicle-catalog.json", import.meta.url), "utf8"));
const source = await readFile(new URL("../lib/vehicle-photo.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source.replace('import photos from "@/data/vehicle-photos.json";', `const photos = ${JSON.stringify(photos)};`), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { vehiclePhoto } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("model photos resolve to existing assets with source attribution", async () => {
  for (const [id, photo] of Object.entries(photos)) {
    const model = catalog.models.find(model => model.vehicleModelId === id);
    assert.ok(model, id);
    assert.equal(model.make, photo.make);
    assert.equal(model.model, photo.model);
    assert.equal(vehiclePhoto(model).src, photo.src);
    assert.ok(photo.author && photo.license && photo.referenceOnly);
    assert.match(photo.sourceUrl, /^https:\/\/commons.wikimedia.org\/wiki\/File:/);
    assert.match(photo.licenseUrl, /^https:\/\/creativecommons.org\/licenses\//);
    await access(new URL(`../public${photo.src}`, import.meta.url));
  }
});
test("different models get different photos and unknown models are never guessed", () => {
  const swift = { make: "Maruti Suzuki", model: "Swift" };
  const polo = { make: "Volkswagen", model: "Polo" };
  assert.notEqual(vehiclePhoto(swift).src, vehiclePhoto(polo).src);
  assert.equal(vehiclePhoto({ make: "Maruti Suzuki", model: "Swift Dzire" }), null);
  assert.equal(vehiclePhoto({ ...swift, vehicleModelId: "unknown" }), null);
  assert.equal(vehiclePhoto({ ...swift, vehicleModelId: "volkswagen__polo" }), null);
  assert.equal(vehiclePhoto({ make: "Unknown", model: "Car" }), null);
});
