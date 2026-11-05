import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { createRiderCore, DeliveryError } from "./rider-core.js";

export function createRiderService(database) {
  const core = createRiderCore(database, {
    randomUUID, generateCode: () => String(randomInt(100000, 1000000)),
    equalCodes: (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)),
    serverTimestamp: () => FieldValue.serverTimestamp(), timestampNow: () => Timestamp.now(),
    timestampFromMillis: (value) => Timestamp.fromMillis(value),
  });
  return Object.fromEntries(Object.entries(core).map(([name, handler]) => [name, async (...args) => {
    try { return await handler(...args); }
    catch (error) { if (error instanceof DeliveryError) throw new HttpsError(error.code, error.message); throw error; }
  }]));
}
