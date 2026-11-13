import { createRiderCore, DeliveryError } from "../../functions/rider-core.js";
import { createFirestoreRest, RestTimestamp, SERVER_TIMESTAMP } from "./firestore-rest.js";
import { createGoogleAuth, readServiceAccount } from "./google-auth.js";
import { createRazorpay, paymentEndpoints } from "./razorpay.js";

const operations = { dispatchPartXDelivery: "dispatch", updatePartXDelivery: "riderAction", getPartXDeliveryCode: "customerCode", requestPartXAfterSale: "requestAfterSale" };
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
async function readBody(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new DeliveryError("invalid-argument", "Delivery details are required.");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new DeliveryError("invalid-argument", "The request is too large."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally { reader.releaseLock(); }
}
async function readInput(request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new DeliveryError("invalid-argument", "Use a JSON request.");
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await readBody(request, 8192)));
    if (!parsed || typeof parsed.data !== "object" || !parsed.data || Array.isArray(parsed.data)) throw new Error();
    return parsed.data;
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError("invalid-argument", "Valid delivery details are required.");
  }
}

function notificationFor(name, input, delivery) {
  if (name === "dispatchPartXDelivery" && input.action === "assign") return { userId: delivery.riderId, title: "New PartX delivery assignment", body: `Pickup from ${delivery.storeName}. Open PartX Rider to accept.`, link: "/rider" };
  if (name === "dispatchPartXDelivery") return { userId: delivery.riderId, title: "PartX assignment updated", body: `Delivery for ${delivery.orderId}: ${delivery.state.toLowerCase()}.`, link: "/rider" };
  if (name === "updatePartXDelivery" && ["decline", "issue"].includes(input.action)) return { userId: delivery.sellerId, title: "PartX delivery needs attention", body: `Order ${delivery.orderId}: ${input.action === "decline" ? "Rider declined the assignment" : "Rider reported a delivery issue"}.`, link: `/seller/orders/${delivery.orderId}` };
  if (name === "updatePartXDelivery" && delivery.kind && delivery.kind !== "delivery") return null;
  if (name === "updatePartXDelivery" && ["pickup", "complete"].includes(input.action)) return { userId: delivery.customerId, title: input.action === "pickup" ? "Your parts are on the way" : "Your PartX order was delivered", body: `Order ${delivery.orderId} · ${delivery.storeName}`, link: `/orders/${delivery.orderId}` };
  return null;
}

export function createWorker({ fetcher = fetch } = {}) {
  const auth = createGoogleAuth(fetcher);
  async function notify(database, env, name, input, result) {
    if (name === "getPartXDeliveryCode" || name === "requestPartXAfterSale") return;
    if (paymentEndpoints.has(name)) {
      if (!result.newlyPaid) return;
      return sendNotification(database, env, result.orderId, {
        userId: result.sellerId, title: "Razorpay test order ready to pack",
        body: `Test payment confirmed for order ${result.orderId}.`, link: `/seller/orders/${result.orderId}`,
      });
    }
    const id = result.deliveryId || input.deliveryId;
    if (!id) return;
    const delivery = (await database.doc(`deliveries/${id}`).get()).data();
    if (!delivery) return;
    const message = notificationFor(name, input, delivery);
    if (message) await sendNotification(database, env, id, message);
  }
  async function sendNotification(database, env, id, message) {
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
      const payment = paymentEndpoints.has(name);
      if (!Object.hasOwn(operations, name) && !payment) return json({ error: { code: "not-found", message: "Delivery endpoint not found." } }, 404, cors);
      if (request.method !== "POST") return json({ error: { code: "invalid-argument", message: "Use POST for delivery actions." } }, 405, { ...cors, Allow: "POST, OPTIONS" });
      try {
        const isWebhook = name === "razorpayWebhook";
        const authorization = request.headers.get("Authorization");
        if (!isWebhook && !authorization?.startsWith("Bearer ")) throw new DeliveryError("unauthenticated", "Sign in to continue.");
        const uid = isWebhook ? null : await auth.verifyFirebaseToken(authorization.slice(7), env.FIREBASE_PROJECT_ID, name === "requestPartXAfterSale" || name === "razorpayCreateOrder");
        const input = isWebhook ? {} : await readInput(request);
        readServiceAccount(env);
        const database = createFirestoreRest({ projectId: env.FIREBASE_PROJECT_ID, accessToken: () => auth.accessToken(env), fetcher });
        const razorpay = payment ? createRazorpay(database, env, fetcher) : null;
        let result;
        switch (name) {
          case "razorpayAvailability": result = await razorpay.availability(uid, input); break;
          case "razorpayCreateOrder": result = await razorpay.start(uid, input); break;
          case "razorpayVerify": result = await razorpay.verify(uid, input); break;
          case "razorpayStatus": result = await razorpay.status(uid, input); break;
          case "razorpayTransferStatus": result = await razorpay.transferStatus(uid, input); break;
          case "razorpayWebhook": result = await razorpay.webhook(await readBody(request, 65536), request.headers.get("X-Razorpay-Signature")); break;
          default: result = await createRiderCore(database, runtime)[operations[name]](uid, input);
        }
        context.waitUntil(notify(database, env, name, input, result).catch(() => console.warn("PartX delivery notification could not be sent")));
        return json({ data: result.newlyPaid ? { paid: true, ...(isWebhook ? { received: true } : {}) } : result }, 200, cors);
      } catch (error) {
        if (error instanceof DeliveryError) return json({ error: { code: error.code, message: error.message } }, statuses[error.code] ?? 500, cors);
        console.error("PartX delivery request failed", typeof error.code === "string" ? error.code : "INTERNAL");
        return json({ error: { code: "unavailable", message: payment ? "The payment service is temporarily unavailable. Please try again." : "The delivery service is temporarily unavailable. Please try again." } }, 503, cors);
      }
    },
  };
}

export default createWorker();
