import { ACTIVE_DELIVERY_STATES, DeliveryError, RIDER_HEARTBEAT_MAX_AGE_MS } from "../../functions/rider-core.js";
import { SERVER_TIMESTAMP } from "./firestore-rest.js";

const pageSize = 25;
const stalledAfter = 45 * 60_000;
const roles = ["customer", "seller", "rider"];
const reviewCollection = "adminPaymentReviews";
const submissionFields = ["paymentSubmittedAt", "upiTransactionReference", "paymentReference"];
const openTicketStatuses = ["Open", "open", "In Progress", "In progress", "in-progress"];
const fields = {
  people: ["name", "email", "roles", "activeRole", "sellerStatus", "createdAt"],
  stores: ["name", "ownerId", "status", "createdAt"],
  riders: ["name", "active", "activationPending", "online", "lastSeenAt", "activeDeliveryId", "createdAt"],
  orders: ["trackingId", "customerId", "sellerId", "storeId", "storeName", "status", "stage", "orderStatus", "paymentMethod", "paymentMode", "paymentStatus", "paymentVerifiedAt", "codCollectedAt", "fulfilment", "riderDeliveryId", "total", "totalAmount", "createdAt", "deliveredAt"],
  deliveries: ["orderId", "storeId", "storeName", "riderId", "riderName", "trackingId", "state", "kind", "issue.reason", "assignedAt", "updatedAt", "deliveredAt", "codCollected", "requestId"],
  tickets: ["orderId", "storeId", "status", "issueType", "issue", "createdAt"],
  afterSales: ["kind", "state", "deliveryId", "item.productName", "item.partNumber", "item.quantity", "createdAt"],
};
const collectionNames = { people: "users" };
const field = (fieldPath) => ({ fieldPath });
const string = (stringValue) => ({ stringValue });
const time = (value) => ({ timestampValue: new Date(value).toISOString() });
const filter = (fieldPath, op, value) => ({ fieldFilter: { field: field(fieldPath), op, value } });
const all = (...filters) => ({ compositeFilter: { op: "AND", filters } });
const inValues = (key, values) => filter(key, "IN", { arrayValue: { values: values.map(string) } });
const order = (fieldPath, direction = "ASCENDING") => ({ field: field(fieldPath), direction });
const timestamp = (value) => {
  const result = typeof value?.toMillis === "function" ? value.toMillis() : typeof value === "string" ? Date.parse(value) : value;
  return Number.isFinite(result) ? result : null;
};
const text = (value, limit = 240) => typeof value === "string" ? value.slice(0, limit) : null;
const safeId = (value) => typeof value === "string" && /^[^/\\%?#\x00-\x1f]{1,200}$/.test(value) && value !== "." && value !== "..";
const invalid = () => { throw new DeliveryError("invalid-argument", "Choose a supported admin view or search."); };
const query = (kind, where) => ({ from: [{ collectionId: collectionNames[kind] ?? kind }], ...(where ? { where } : {}) });

function riderStatus(data, now) {
  if (data.activationPending === true) return "Pending activation";
  if (data.active === true && safeId(data.activeDeliveryId)) return "On a delivery";
  const seen = timestamp(data.lastSeenAt);
  if (data.active === true && data.online === true && seen !== null && now - seen <= RIDER_HEARTBEAT_MAX_AGE_MS) return "Available";
  return "Offline";
}

function paymentStatus(data, codCollected = false) {
  const raw = text(data.paymentStatus)?.toUpperCase();
  const paid = raw === "PAID";
  const terminal = raw === "PAYMENT_EXPIRED" ? "Expired" : raw === "PAYMENT_CANCELLED" ? "Cancelled" : null;
  if (data.paymentMethod === "razorpay" && data.paymentMode === "test") return `Razorpay test · ${terminal ?? (paid ? "Confirmed" : "Pending")}`;
  if (terminal) return terminal;
  if (data.paymentMethod === "cod" || raw === "COD" || raw === "PAYMENT_DUE") return codCollected || timestamp(data.codCollectedAt) !== null || paid ? "COD collected" : "COD due";
  if (raw === "PAYMENT_SUBMITTED") return "UPI awaiting seller verification";
  if (raw === "VERIFICATION_FAILED") return "UPI reference rejected";
  if (data.paymentMethod === "upi") return paid ? "UPI confirmed by seller" : "UPI pending";
  if (data.paymentMethod === "razorpay") return paid ? "Razorpay confirmed" : "Razorpay pending";
  return paid ? "Paid · legacy record" : "Payment pending";
}

function orderItems(data) {
  function item(line) {
    if (!line || typeof line !== "object") return [];
    const productName = text(line.productName)?.trim() || text(line.name)?.trim();
    const partNumber = text(line.partNumber)?.trim() || null;
    const productId = text(line.productId)?.trim();
    if (!productName && !partNumber && !productId) return [];
    const quantity = typeof line.quantity === "string" ? Number(line.quantity) : line.quantity;
    return [{
      productName: productName || "Order item",
      partNumber,
      quantity: Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null,
      unitPrice: Number.isFinite(line.unitPrice) && line.unitPrice >= 0 ? line.unitPrice : null,
    }];
  }
  const items = Array.isArray(data.items) ? data.items.flatMap(item) : [];
  return items.length ? items : item(data);
}

function project(kind, id, data, now) {
  const createdAt = timestamp(data.createdAt);
  switch (kind) {
    case "people": return { id, name: text(data.name), email: text(data.email), roles: roles.filter((role) => Array.isArray(data.roles) && data.roles.includes(role)), createdAt };
    case "stores": return { id, name: text(data.name), ownerId: text(data.ownerId), status: text(data.status), createdAt };
    case "riders": return { id, name: text(data.name), status: riderStatus(data, now), lastSeenAt: timestamp(data.lastSeenAt), activeDeliveryId: text(data.activeDeliveryId), createdAt };
    case "orders": return {
      id, trackingId: text(data.trackingId), storeId: text(data.storeId), storeName: text(data.storeName), customerId: text(data.customerId),
      sellerId: text(data.sellerId), status: text(data.orderStatus && data.orderStatus !== "PLACED" ? data.orderStatus.replaceAll?.("_", " ") : data.stage ?? data.status), payment: paymentStatus(data),
      total: Number.isFinite(data.totalAmount ?? data.total) ? data.totalAmount ?? data.total : null,
      createdAt, deliveredAt: timestamp(data.deliveredAt), fulfilment: text(data.fulfilment), riderDeliveryId: text(data.riderDeliveryId),
    };
    case "deliveries": return {
      id, trackingId: text(data.trackingId) ?? `PX-RIDE-${id}`, orderId: text(data.orderId), riderId: text(data.riderId),
      riderName: text(data.riderName), storeId: text(data.storeId), storeName: text(data.storeName), status: text(data.state),
      kind: text(data.kind) ?? "delivery", issue: text(data.issue?.reason), createdAt: timestamp(data.assignedAt), updatedAt: timestamp(data.updatedAt),
      deliveredAt: timestamp(data.deliveredAt),
    };
    case "tickets": return { id, orderId: text(data.orderId), storeId: text(data.storeId), status: text(data.status), issueType: text(data.issueType) || text(data.issue), createdAt };
    case "afterSales": return {
      id, kind: text(data.kind), status: text(data.state), deliveryId: text(data.deliveryId), productName: text(data.item?.productName),
      partNumber: text(data.item?.partNumber), quantity: Number.isSafeInteger(data.item?.quantity) ? data.item.quantity : null, createdAt,
    };
    default: return invalid();
  }
}

function attentionFilters(now, cutoff = now) {
  return {
    stalled: ["deliveries", all(inValues("state", ACTIVE_DELIVERY_STATES), filter("updatedAt", "LESS_THAN_OR_EQUAL", time(cutoff - stalledAfter))), "updatedAt"],
    activations: ["riders", filter("activationPending", "EQUAL", { booleanValue: true })],
    tickets: ["tickets", inValues("status", openTicketStatuses)],
  };
}

function indiaDay(now) {
  const offset = 330 * 60_000;
  return Math.floor((now + offset) / 86_400_000) * 86_400_000 - offset;
}

async function readActivity(env, path, input) {
  if (!env.PARTX_ADMIN_ACTIVITY) throw new DeliveryError("unavailable", "Activity tracking is temporarily unavailable.");
  const namespace = env.PARTX_ADMIN_ACTIVITY;
  const response = await namespace.get(namespace.idFromName("partx-owner-activity-v1")).fetch(`https://activity.internal${path}`, {
    method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new DeliveryError("unavailable", "Activity tracking is temporarily unavailable.");
  return response.json();
}

export function createAdminProfileCache() {
  const profiles = new Map();
  return async function loadProfile(env, database, uid) {
    const key = `${env.FIREBASE_PROJECT_ID}:${uid}`;
    const now = Date.now();
    let entry = profiles.get(key);
    if (!entry || entry.expiresAt <= now) {
      if (profiles.size >= 512) profiles.delete(profiles.keys().next().value);
      const value = database().doc(`users/${uid}`).get().then((snapshot) => snapshot.data());
      entry = { value, expiresAt: now + 5 * 60_000 };
      profiles.set(key, entry);
      value.then((profile) => {
        if (!profile && profiles.get(key) === entry) profiles.delete(key);
      }, () => {
        if (profiles.get(key) === entry) profiles.delete(key);
      });
    }
    return entry.value;
  };
}

export const adminEndpoints = new Set(["partxAdmin", "recordPartXSignIn", "checkInPartXPresence"]);

export async function handleAdminEndpoint({ name, authorization, auth, env, database, readInput, loadProfile }) {
  const ownerOnly = name === "partxAdmin";
  const identity = await auth.verifyFirebaseIdentity(authorization?.slice(7), env.FIREBASE_PROJECT_ID);
  if (ownerOnly) {
    if (!env.PARTX_ADMIN_UID || identity.uid !== env.PARTX_ADMIN_UID) throw new DeliveryError("permission-denied", "This account does not have PartX owner access.");
    if (!identity.emailVerified) throw new DeliveryError("admin-unverified-email", "Verify your email before continuing.");
    const input = await readInput();
    if (input.action === "closeTicket") {
      if (!safeId(input.id)) return invalid();
      return closeTicket(database(), input.id);
    }
    if (input.action === "closePaymentReview") {
      if (!safeId(input.id) || typeof input.submissionKey !== "string" || !/^[a-f0-9]{64}$/.test(input.submissionKey)) return invalid();
      return closePaymentReview(database(), input.id, input.submissionKey);
    }
    return readAdmin(input, env, database);
  }
  if (!safeId(identity.uid) || identity.uid === env.PARTX_ADMIN_UID) throw new DeliveryError("permission-denied", "A PartX profile is required.");
  const signIn = name === "recordPartXSignIn";
  if (signIn && Date.now() - identity.signedInAt > 5 * 60_000) return { ok: true };
  const profile = await loadProfile(env, database, identity.uid);
  const role = profile?.activeRole;
  if (!roles.includes(role) || !Array.isArray(profile.roles) || !profile.roles.includes(role)) throw new DeliveryError("permission-denied", "A PartX profile is required.");
  if (!signIn && role === "rider") return { ok: true };
  return readActivity(env, signIn ? "/sign-in" : "/presence", { uid: identity.uid, signedInAt: identity.signedInAt, name: text(profile.name, 120) || "PartX account", role });
}

async function closeTicket(db, id) {
  const ref = db.doc(`tickets/${id}`);
  await db.runTransaction(async (tx) => {
    const ticket = (await tx.get(ref)).data();
    if (!ticket) throw new DeliveryError("not-found", "This ticket could not be found.");
    if (text(ticket.status)?.toLowerCase() === "resolved") return;
    if (!openTicketStatuses.includes(ticket.status)) {
      throw new DeliveryError("failed-precondition", "Only open support tickets can be closed.");
    }
    tx.update(ref, { status: "Resolved", resolvedAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP });
  });
  return { status: "Resolved" };
}

async function paymentSubmissionKey(data) {
  const value = JSON.stringify([timestamp(data.paymentSubmittedAt), text(data.upiTransactionReference) || text(data.paymentReference)]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function closePaymentReview(db, id, expectedKey) {
  const orderRef = db.doc(`orders/${id}`);
  const reviewRef = db.doc(`${reviewCollection}/${id}`);
  await db.runTransaction(async (tx) => {
    const orderData = (await tx.get(orderRef)).data();
    if (!orderData) throw new DeliveryError("not-found", "This order could not be found.");
    if (orderData.paymentStatus !== "PAYMENT_SUBMITTED") {
      throw new DeliveryError("failed-precondition", "This payment is no longer awaiting seller verification. Refresh the order.");
    }
    const submissionKey = await paymentSubmissionKey(orderData);
    if (submissionKey !== expectedKey) {
      throw new DeliveryError("failed-precondition", "The customer submitted a new payment reference. Refresh the order before closing it.");
    }
    if ((await tx.get(reviewRef)).data()?.submissionKey === submissionKey) return;
    tx.set(reviewRef, { submissionKey, closedAt: SERVER_TIMESTAMP });
  });
  return { status: "Resolved" };
}

async function* openPaymentReviewPages(db, after, fieldPaths) {
  const limit = 100;
  while (true) {
    const rows = await db.queryDocuments({
      ...query("orders", filter("paymentStatus", "EQUAL", string("PAYMENT_SUBMITTED"))),
      select: { fields: [...new Set([...fieldPaths, ...submissionFields])].map(field) },
      limit, orderBy: [order("__name__")],
      ...(after ? { startAt: { values: [{ referenceValue: after }], before: false } } : {}),
    });
    const closed = await db.getMany(rows.map(({ id }) => `${reviewCollection}/${id}`), ["submissionKey"]);
    const open = await Promise.all(rows.map(async (row) => {
      const saved = closed.get(`${reviewCollection}/${row.id}`);
      return !saved || saved.submissionKey !== await paymentSubmissionKey(row.data);
    }));
    yield rows.filter((_, index) => open[index]);
    if (rows.length < limit) return;
    after = rows.at(-1).name;
  }
}

async function countOpenPaymentReviews(db) {
  let count = 0;
  for await (const rows of openPaymentReviewPages(db, null, [])) count += rows.length;
  return count;
}

async function listOpenPaymentReviews(db, cursor, now) {
  const visible = [];
  const after = cursor ? db.doc(`orders/${cursor.id}`).name : null;
  for await (const rows of openPaymentReviewPages(db, after, fields.orders)) {
    visible.push(...rows);
    if (visible.length > pageSize) break;
  }
  return {
    kind: "orders", rows: visible.slice(0, pageSize).map(({ id, data }) => project("orders", id, data, now)),
    next: visible.length > pageSize ? { id: visible[pageSize - 1].id, value: "", cutoff: now } : null,
  };
}

function contactPerson(primary = {}, fallback = {}) {
  const phone = [primary.phone, primary.mobile, fallback.phone, fallback.mobile].map((value) => text(value)?.replace(/[ ().-]/g, ""))
    .find((value) => value && /^\+?[0-9]{7,15}$/.test(value)) ?? null;
  const email = [primary.email, fallback.email].map((value) => text(value)?.trim())
    .find((value) => value && /^[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(value)) ?? null;
  return { name: text(primary.name) || text(fallback.name), phone, email };
}

async function orderContacts(db, data) {
  const store = safeId(data.storeId) ? (await db.doc(`stores/${data.storeId}`).get()).data() : undefined;
  const sellerId = store?.ownerId || data.sellerId;
  const customerPath = safeId(data.customerId) ? `users/${data.customerId}` : null;
  const sellerPath = safeId(sellerId) ? `users/${sellerId}` : null;
  const profiles = await db.getMany([customerPath, sellerPath].filter(Boolean), ["name", "phone", "mobile", "email"]);
  return {
    customer: contactPerson(profiles.get(customerPath), data.customer ?? {}),
    seller: contactPerson({ ...store, name: store?.name || data.storeName }, profiles.get(sellerPath)),
  };
}

async function readAdmin(input, env, getDatabase) {
  const now = Date.now();
  if (input.view === "session") return { owner: true };
  if (input.view === "activity") {
    const before = input.before;
    if (before && (!safeId(before.uid) || !Number.isSafeInteger(before.signedInAt))) return invalid();
    return readActivity(env, "/read", { before });
  }
  const db = getDatabase();
  if (input.view === "overview") {
    const day = indiaDay(now);
    const attention = attentionFilters(now);
    const roleQueries = roles.map((role) => query("people", filter("roles", "ARRAY_CONTAINS", string(role))));
    const queries = [
      ...roleQueries, query("stores"),
      query("orders", all(filter("createdAt", "GREATER_THAN_OR_EQUAL", time(day)), filter("createdAt", "LESS_THAN", time(day + 86_400_000)))),
      query("deliveries", inValues("state", ACTIVE_DELIVERY_STATES)),
      ...Object.values(attention).map(([kind, where, sort]) => ({ ...query(kind, where), ...(sort ? { orderBy: [order(sort, "DESCENDING")] } : {}) })),
    ];
    const [customers, sellers, riders, stores, todayOrders, activeDeliveries, stalled, activations, tickets, verification] =
      await Promise.all([...queries.map((item) => db.countDocuments(item)), countOpenPaymentReviews(db)]);
    return { customers, sellers, riders, stores, todayOrders, activeDeliveries, attention: { stalled, activations, tickets, verification }, asOf: now };
  }
  if (input.view === "detail" && safeId(input.id) && Object.hasOwn(fields, input.kind) && input.kind !== "afterSales") {
    return readDetail(db, env, input.kind, input.id, now);
  }
  if (input.view !== "list") return invalid();
  return readList(db, env, input, now);
}

function selection(kind) {
  return { fields: fields[kind].map(field) };
}

async function findRelated(db, kind, where, now, parent) {
  const rows = await db.queryDocuments({ ...query(kind, where), select: selection(kind), limit: pageSize }, parent);
  return rows.map(({ id, data }) => project(kind, id, data, now));
}

async function readDetail(db, env, kind, id, now) {
  const snapshot = await db.doc(`${collectionNames[kind] ?? kind}/${id}`).get();
  if (!snapshot.exists) throw new DeliveryError("not-found", "This record could not be found.");
  const data = snapshot.data();
  const record = project(kind, id, data, now);
  let related = {};
  if (kind === "people") {
    const [stores, latest, rider] = await Promise.all([
      findRelated(db, "stores", filter("ownerId", "EQUAL", string(id)), now),
      readActivity(env, "/latest", { uids: [id] }).catch(() => null),
      record.roles.includes("rider") ? db.doc(`riders/${id}`).get() : null,
    ]);
    related = { stores, riders: rider?.exists ? [project("riders", id, rider.data(), now)] : [] };
    record.lastSignIn = latest?.[id] ?? null;
    record.activityAvailable = latest !== null;
  } else if (kind === "orders") {
    const [deliveries, afterSales, directDelivery, tickets, contacts, closedReview] = await Promise.all([
      findRelated(db, "deliveries", filter("orderId", "EQUAL", string(id)), now),
      findRelated(db, "afterSales", undefined, now, `orders/${id}`),
      safeId(data.riderDeliveryId) ? db.doc(`deliveries/${data.riderDeliveryId}`).get() : null,
      findRelated(db, "tickets", filter("orderId", "EQUAL", string(id)), now),
      orderContacts(db, data),
      data.paymentStatus === "PAYMENT_SUBMITTED" ? db.doc(`${reviewCollection}/${id}`).get() : null,
    ]);
    related = { deliveries, afterSales, ...(tickets.length ? { tickets } : {}) };
    let paymentReview;
    if (data.paymentStatus === "PAYMENT_SUBMITTED") {
      const submissionKey = await paymentSubmissionKey(data);
      const review = closedReview?.data();
      paymentReview = { submissionKey, closedAt: review?.submissionKey === submissionKey ? timestamp(review.closedAt) : null };
    }
    record.payment = paymentStatus(data, directDelivery?.data()?.codCollected === true);
    return { kind, record, related, items: orderItems(data), contacts, paymentReview };
  } else if (kind === "tickets") {
    record.canClose = openTicketStatuses.includes(data.status);
    if (data.resolvedAt) record.resolvedAt = timestamp(data.resolvedAt);
    const linkedOrder = safeId(data.orderId) ? (await db.doc(`orders/${data.orderId}`).get()).data() : undefined;
    return { kind, record, related, contacts: await orderContacts(db, linkedOrder ?? data) };
  } else if (kind === "riders") {
    const [deliveries, latest] = await Promise.all([
      findRelated(db, "deliveries", filter("riderId", "EQUAL", string(id)), now),
      readActivity(env, "/latest", { uids: [id] }).catch(() => null),
    ]);
    related.deliveries = deliveries;
    record.lastSignIn = latest?.[id] ?? null;
    record.activityAvailable = latest !== null;
  }
  return { kind, record, related };
}

async function readList(db, env, input, now) {
  let { kind } = input;
  let where;
  let orderedField = "__name__";
  const cursor = input.cursor;
  if (cursor && (!safeId(cursor.id) || typeof cursor.value !== "string" || cursor.value.length > 512)) return invalid();
  const search = typeof input.search === "string" ? input.search.trim() : "";
  if (search.length > 200) return invalid();
  if (kind === "attention" && input.queue === "verification") return listOpenPaymentReviews(db, cursor, now);
  const attention = attentionFilters(now, cursor && Number.isSafeInteger(cursor.cutoff) ? Math.min(cursor.cutoff, now) : now);
  if (kind === "attention" && Object.hasOwn(attention, input.queue)) {
    [kind, where, orderedField = "__name__"] = attention[input.queue];
  } else if (!Object.hasOwn(fields, kind) || kind === "afterSales") return invalid();
  else if (search) {
    const searchBy = input.searchBy;
    if (searchBy === "id" && safeId(search)) {
      const snapshot = await db.doc(`${collectionNames[kind] ?? kind}/${search}`).get();
      const rows = snapshot.exists ? [project(kind, search, snapshot.data(), now)] : [];
      return includeLatest(env, { kind, rows, next: null });
    }
    if (searchBy === "trackingId" && ["orders", "deliveries"].includes(kind)) {
      const normalized = search.toUpperCase();
      if (kind === "deliveries" && normalized.startsWith("PX-RIDE-")) {
        const provided = search.slice("PX-RIDE-".length);
        const id = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(provided) ? provided.toLowerCase() : provided;
        if (safeId(id)) {
          const snapshot = await db.doc(`deliveries/${id}`).get();
          if (snapshot.exists && (!snapshot.data().trackingId || snapshot.data().trackingId.toUpperCase() === normalized)) {
            return { kind, rows: [project(kind, id, snapshot.data(), now)], next: null };
          }
        }
      }
      where = filter("trackingId", "EQUAL", string(normalized));
    }
    else if (searchBy === "email" && kind === "people") where = filter("email", "EQUAL", string(search.toLowerCase()));
    else if (searchBy === "name" && ["people", "riders", "stores"].includes(kind)) {
      orderedField = "name";
      where = all(filter("name", "GREATER_THAN_OR_EQUAL", string(search)), filter("name", "LESS_THAN_OR_EQUAL", string(search + "\uf8ff")));
    } else return invalid();
  } else if (kind === "people" && roles.includes(input.role)) where = filter("roles", "ARRAY_CONTAINS", string(input.role));
  else if (kind === "deliveries" && input.active === true) where = inValues("state", ACTIVE_DELIVERY_STATES);
  else if (kind === "orders" && input.today === true) {
    orderedField = "createdAt";
    const day = indiaDay(cursor && Number.isSafeInteger(cursor.cutoff) ? Math.min(cursor.cutoff, now) : now);
    where = all(filter("createdAt", "GREATER_THAN_OR_EQUAL", time(day)), filter("createdAt", "LESS_THAN", time(day + 86_400_000)));
  }
  const path = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionNames[kind] ?? kind}`;
  const nameCursor = cursor ? { referenceValue: `${path}/${cursor.id}` } : null;
  const cutoff = cursor && Number.isSafeInteger(cursor.cutoff) ? Math.min(cursor.cutoff, now) : now;
  const dateOrder = orderedField === "updatedAt" || orderedField === "createdAt";
  if (cursor && dateOrder && !Number.isFinite(Date.parse(cursor.value))) return invalid();
  const direction = dateOrder ? "DESCENDING" : "ASCENDING";
  const documents = await db.queryDocuments({
    ...query(kind, where), select: selection(kind), limit: pageSize + 1,
    orderBy: orderedField === "__name__" ? [order("__name__")] : [order(orderedField, direction), order("__name__", direction)],
    ...(cursor ? { startAt: { values: orderedField === "__name__" ? [nameCursor] : [dateOrder ? { timestampValue: cursor.value } : string(cursor.value), nameCursor], before: false } } : {}),
  });
  const rows = documents.slice(0, pageSize);
  const last = rows.at(-1);
  const next = documents.length > pageSize ? {
    id: last.id,
    value: dateOrder ? last.rawFields[orderedField].timestampValue : orderedField === "name" ? last.data.name : "",
    cutoff,
  } : null;
  return includeLatest(env, { kind, rows: rows.map(({ id, data }) => project(kind, id, data, now)), next });
}

async function includeLatest(env, result) {
  if (result.kind !== "people" && result.kind !== "riders" || result.rows.length === 0) return result;
  const latest = await readActivity(env, "/latest", { uids: result.rows.map(({ id }) => id) }).catch(() => null);
  return { ...result, activityAvailable: latest !== null, rows: result.rows.map((row) => ({ ...row, lastSignIn: latest?.[row.id] ?? null })) };
}
