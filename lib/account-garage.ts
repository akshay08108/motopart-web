import { doc, runTransaction, type Firestore } from "firebase/firestore";
import type { Vehicle } from "./types";

export async function removeAccountVehicle(database: Firestore, uid: string, vehicleId: string) {
  const reference = doc(database, "users", uid, "preferences", "garage");
  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const saved = snapshot.data();
    const vehicles: Vehicle[] = Array.isArray(saved.vehicles) ? saved.vehicles : [];
    const remaining = vehicles.filter((vehicle) => vehicle.id !== vehicleId);
    if (remaining.length === vehicles.length) return;
    // Re-read on retries so another device's additions or active selection survive.
    const activeVehicleId = remaining.some((vehicle) => vehicle.id === saved.activeVehicleId)
      ? saved.activeVehicleId : remaining[0]?.id ?? "";
    transaction.update(reference, { vehicles: remaining, activeVehicleId, needsVehicle: false });
    if (/^[A-Za-z0-9_-]{1,128}$/.test(vehicleId)) {
      transaction.delete(doc(database, "users", uid, "photos", `vehicle-${vehicleId}`));
    }
  });
}
