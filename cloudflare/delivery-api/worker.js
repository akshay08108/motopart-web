import { createRiderCore, DeliveryError } from "../../functions/rider-core.js";
import { createFirestoreRest, RestTimestamp, SERVER_TIMESTAMP } from "./firestore-rest.js";
import { createGoogleAuth, readServiceAccount } from "./google-auth.js";

const operations = { dispatchPartXDelivery: "dispatch", updatePartXDelivery: "riderAction", getPartXDeliveryCode: "customerCode" };
const statuses = { "invalid-argument": 400, unauthenticated: 401, "permission-denied": 403, "not-found": 404, "failed-precondition": 409, "already-exists": 409, "resource-exhausted": 429, unavailable: 503 };
const json = (value, status, cors = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...cors } });
const runtime = {
  randomUUID: () => crypto.randomUUID(), serverTimestamp: () => SERVER_TIMESTAMP,
  timestampNow: () => new RestTimestamp(Date.now()), timestampFromMillis: (value) => new RestTimestamp(value),
  generateCode: () => {
    const bytes = new Uint32Array(1); const limit = Math.floor(4294967296 / 900000) * 900000;
    do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
    return String(100000 + bytes[0] % 900000);
  },
  equalCodes: (a, b) => { if (a.length !== b.length) return false; let difference = 0; for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index); return difference === 0; },
};
async function readInput(request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new DeliveryError("invalid-argument", "Use a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new DeliveryError("invalid-argument", "Delivery details are required.");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); throw new DeliveryError("invalid-argument", "The request is too large."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed.data !== "object" || !parsed.data || Array.isArray(parsed.data)) throw new Error();
    return parsed.data;
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError("invalid-argument", "Valid delivery details are required.");
  } finally { reader.releaseLock(); }
}

function notificationFor(name, input, delivery) {
  if (name === "dispatchPartXDelivery" && input.action === "assign") return { userId: delivery.riderId, title: "New PartX delivery assignment", body: `Pickup from ${delivery.storeName}. Open PartX Rider to accept.`, link: "/rider" };
  if (name === "dispatchPartXDelivery") return { userId: delivery.riderId, title: "PartX assignment updated", body: `Delivery for ${delivery.orderId}: ${delivery.state.toLowerCase()}.`, link: "/rider" };
  if (name === "updatePartXDelivery" && ["decline", "issue"].includes(input.action)) return { userId: delivery.sellerId, title: "PartX delivery needs attention", body: `Order ${delivery.orderId}: ${input.action === "decline" ? "Rider declined the assignment" : "Rider reported a delivery issue"}.`, link: `/seller/orders/${delivery.orderId}` };
  if (name === "updatePartXDelivery" && ["pickup", "complete"].includes(input.action)) return { userId: delivery.customerId, title: input.action === "pickup" ? "Your parts are on the way" : "Your PartX order was delivered", body: `Order ${delivery.orderId} · ${delivery.storeName}`, link: `/orders/${delivery.orderId}` };
  return null;
}

export function createWorker({ fetcher = fetch } = {}) {
  const auth = createGoogleAuth(fetcher);
  async function notify(database, env, name, input, result) {
    if (name === "getPartXDeliveryCode") return;
    const id = result.deliveryId || input.deliveryId;
    if (!id) return;
    const delivery = (await database.doc(`deliveries/${id}`).get()).data();
    if (!delivery) return;
    const message = notificationFor(name, input, delivery);
    if (!message) return;
    const devices = await database.notificationDevices(message.userId);
    for (let index = 0; index < devices.length; index += 5) {
      await Promise.allSettled(devices.slice(index, index + 5).map(async (device) => {
        if (typeof device.token !== "string") return;
        const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
          method: "POST", headers: { Authorization: `Bearer ${await auth.accessToken(env)}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { token: device.token, data: { title: message.title, body: message.body, link: message.link, tag: `delivery-${id}` }, webpush: { fcm_options: { link: message.link } }, android: { priority: "high" } } }), signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          if (failure.error?.details?.some((detail) => detail.errorCode === "UNREGISTERED")) await database.removeDevice(device.name);
          else console.warn("PartX notification provider rejected a message", response.status);
        }
      }));
    }
  }
  return {
    async fetch(request, env, context = { waitUntil: () => {} }) {
      const origin = request.headers.get("Origin");
      const allowed = (env.ALLOWED_ORIGINS ?? "https://motopart-web.vercel.app").split(",").map((item) => item.trim());
      if (origin && !allowed.includes(origin)) return json({ error: { code: "permission-denied", message: "This origin is not allowed." } }, 403);
      const cors = origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "600" } });
      const name = new URL(request.url).pathname.replace(/^\/+|\/+$/g, "");
      if (request.method === "GET" && ["", "health"].includes(name)) {
        try { readServiceAccount(env); return json({ service: "PartX delivery API", version: "cloudflare-v1", configuration: "present" }, 200, cors); }
        catch { return json({ service: "PartX delivery API", version: "cloudflare-v1", configuration: "required" }, 503, cors); }
      }
      if (!operations[name]) return json({ error: { code: "not-found", message: "Delivery endpoint not found." } }, 404, cors);
      if (request.method !== "POST") return json({ error: { code: "invalid-argument", message: "Use POST for delivery actions." } }, 405, { ...cors, Allow: "POST, OPTIONS" });
      try {
        const authorization = request.headers.get("Authorization");
        if (!authorization?.startsWith("Bearer ")) throw new DeliveryError("unauthenticated", "Sign in to continue.");
        const uid = await auth.verifyFirebaseToken(authorization.slice(7), env.FIREBASE_PROJECT_ID);
        const input = await readInput(request);
        readServiceAccount(env);
        const database = createFirestoreRest({ projectId: env.FIREBASE_PROJECT_ID, accessToken: () => auth.accessToken(env), fetcher });
        const service = createRiderCore(database, runtime);
        const result = await service[operations[name]](uid, input);
        context.waitUntil(notify(database, env, name, input, result).catch(() => console.warn("PartX delivery notification could not be sent")));
        return json({ data: result }, 200, cors);
      } catch (error) {
        if (error instanceof DeliveryError) return json({ error: { code: error.code, message: error.message } }, statuses[error.code] ?? 500, cors);
        console.error("PartX delivery request failed", typeof error.code === "string" ? error.code : "INTERNAL");
        return json({ error: { code: "unavailable", message: "The delivery service is temporarily unavailable. Please try again." } }, 503, cors);
      }
    },
  };
}

export default createWorker();
