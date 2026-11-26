import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesVehicle } from "../lib/vehicle-fitment.ts";
const swift = { id: "customer-car-123", vehicleModelId: "maruti_suzuki__swift", make: "Maruti Suzuki", model: "Swift", year: 2020 };
test("catalogue model IDs match a customer's independently saved vehicle ID", () => {
  assert.equal(matchesVehicle({ compatibleVehicleIds: ["maruti_suzuki__swift"] }, swift), true);
  assert.equal(matchesVehicle({ compatibleVehicleIds: ["customer-car-123"] }, swift), true);
});
test("model names and entered details never create an unsupported fitment claim", () => {
  assert.equal(matchesVehicle({ compatibleVehicleIds: ["Swift", "2020"] }, swift), false);
  assert.equal(matchesVehicle({ compatibleVehicleIds: ["hyundai__creta"] }, swift), false);
  assert.equal(matchesVehicle({ compatibleVehicleIds: [] }, swift), false);
});
test("unknown vehicles do not match; legacy saved IDs remain supported", () => {
  assert.equal(matchesVehicle({ compatibleVehicleIds: ["maruti_suzuki__swift"] }), false);
  assert.equal(matchesVehicle({ compatibleVehicleIds: ["legacy-car"] }, { id: "legacy-car", make: "Maruti Suzuki", model: "Swift" }), true);
});
