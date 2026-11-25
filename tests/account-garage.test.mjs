import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { removeAccountVehicle } from "../lib/account-garage.ts";

let environment;
before(async () => {
  environment = await initializeTestEnvironment({ projectId: "demo-partx-vehicle-removal", firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") } });
  await environment.clearFirestore();
});
after(async () => environment?.cleanup());
const vehicle = id => ({ id, make: "Tata Motors", model: "Nexon" });
const client = uid => environment.authenticatedContext(uid, { email_verified: true }).firestore();
const reference = (db, uid) => doc(db, "users", uid, "preferences", "garage");
async function seed(uid, ids, active) {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "users", uid), { roles: ["customer"], activeRole: "customer" });
    await setDoc(reference(context.firestore(), uid), { vehicles: ids.map(vehicle), activeVehicleId: active, garages: [{ id: "trusted", name: "Saved Garage" }], needsVehicle: false });
  });
}
async function saved(db, uid) { return (await getDoc(reference(db, uid))).data(); }

test("removing an inactive vehicle preserves the active vehicle and trusted garages", async () => {
  const uid = "inactive"; await seed(uid, ["first", "second"], "second");
  const db = client(uid); await removeAccountVehicle(db, uid, "first");
  const data = await saved(db, uid);
  assert.deepEqual(data.vehicles.map(v => v.id), ["second"]);
  assert.equal(data.activeVehicleId, "second");
  assert.equal(data.garages[0].name, "Saved Garage");
});
test("removing the active vehicle selects another saved vehicle", async () => {
  const uid = "active"; await seed(uid, ["first", "second"], "first");
  const db = client(uid); await removeAccountVehicle(db, uid, "first");
  assert.equal((await saved(db, uid)).activeVehicleId, "second");
});
test("removing the last vehicle leaves an empty garage without forcing onboarding", async () => {
  const uid = "last"; await seed(uid, ["only"], "only");
  const db = client(uid); await removeAccountVehicle(db, uid, "only");
  const data = await saved(db, uid);
  assert.deepEqual(data.vehicles, []);
  assert.equal(data.activeVehicleId, "");
  assert.equal(data.needsVehicle, false);
  assert.equal(data.garages.length, 1);
  await removeAccountVehicle(db, uid, "only");
  assert.deepEqual(await saved(db, uid), data);
});
test("concurrent additions from another device survive vehicle removal", async () => {
  const uid = "concurrent"; await seed(uid, ["first", "second"], "first");
  const desktop = client(uid), mobile = client(uid);
  await Promise.all([
    removeAccountVehicle(desktop, uid, "first"),
    updateDoc(reference(mobile, uid), { vehicles: arrayUnion(vehicle("new")), activeVehicleId: "new" }),
  ]);
  const data = await saved(desktop, uid);
  assert.deepEqual(data.vehicles.map(v => v.id).sort(), ["new", "second"]);
  assert.equal(data.activeVehicleId, "new");
});
test("another account cannot read or remove the owner's saved vehicles", async () => {
  const uid = "private"; await seed(uid, ["first"], "first");
  await assertFails(removeAccountVehicle(client("other"), uid, "first"));
  assert.equal((await saved(client(uid), uid)).vehicles.length, 1);
});
