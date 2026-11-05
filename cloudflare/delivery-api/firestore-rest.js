// Minimal Firestore REST adapter. The shared delivery service uses the same
// transaction interface in Cloud Functions, Workers, and emulator tests.
export const SERVER_TIMESTAMP = Symbol("Firestore server timestamp");
export class RestTimestamp {
  constructor(value) { this.value = value; }
  toMillis() { return this.value; }
}
export class FirestoreRestError extends Error {
  constructor(code, status) { super("Database operation failed"); this.code = code; this.status = status; }
}
const fieldPath = (key) => /^[A-Za-z_][A-Za-z_0-9]*$/.test(key) ? key : "`" + key.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";

export function decodeValue(value) {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return new RestTimestamp(Date.parse(value.timestampValue));
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  throw new Error("Unsupported database value");
}
export function decodeFields(fields) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)])); }
function encodeValue(value, path, transforms) {
  if (value === SERVER_TIMESTAMP) { transforms.push({ fieldPath: path, setToServerValue: "REQUEST_TIME" }); return undefined; }
  if (value === null) return { nullValue: null };
  if (value instanceof RestTimestamp) return { timestampValue: new Date(value.toMillis()).toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => {
    if (item === SERVER_TIMESTAMP) throw new Error("Server timestamps cannot be array elements");
    return encodeValue(item, path, transforms);
  }) } };
  if (value && typeof value === "object") {
    const fields = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) throw new Error("Undefined database field");
      const encoded = encodeValue(item, path ? `${path}.${fieldPath(key)}` : fieldPath(key), transforms);
      if (encoded) fields[key] = encoded;
    }
    return { mapValue: { fields } };
  }
  throw new Error("Unsupported database field");
}

export function createFirestoreRest({ projectId, accessToken, fetcher = fetch, baseUrl = "https://firestore.googleapis.com/v1" }) {
  const root = `projects/${projectId}/databases/(default)/documents`;
  function document(path) {
    if (typeof path !== "string" || path.split("/").length % 2 !== 0 || path.split("/").some((part) => !part || part === "." || part === ".." || /[?#]/.test(part))) throw new Error("Invalid database document path");
    return { path, name: `${root}/${path}`, get: () => get(path) };
  }
  async function request(path, body, method = "POST") {
    const response = await fetcher(`${baseUrl}/${path}`, {
      method, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new FirestoreRestError(error.error?.status ?? "UNKNOWN", response.status);
    }
    return response.status === 204 ? {} : response.json();
  }
  async function get(path, transaction) {
    const name = document(path).name;
    try {
      // Use batchGet for transaction reads: Firestore's REST emulator does not
      // correctly decode a transaction's byte string in GET query parameters.
      const rows = transaction ? await request(`${root}:batchGet`, { documents: [name], transaction }) : undefined;
      const result = transaction ? rows.find((row) => row.found)?.found : await request(name, undefined, "GET");
      if (!result) return { exists: false, data: () => undefined };
      const data = decodeFields(result.fields ?? {});
      return { exists: true, data: () => data };
    } catch (error) {
      if (error.status === 404) return { exists: false, data: () => undefined };
      throw error;
    }
  }
  function write(kind, ref, data) {
    if (kind === "delete") return { delete: ref.name };
    const transforms = [];
    const fields = encodeValue(data, "", transforms).mapValue.fields;
    return {
      update: { name: ref.name, fields },
      ...(kind === "update" ? { updateMask: { fieldPaths: Object.keys(data).filter((key) => data[key] !== SERVER_TIMESTAMP).map(fieldPath) }, currentDocument: { exists: true } } : {}),
      ...(kind === "create" ? { currentDocument: { exists: false } } : {}),
      ...(transforms.length ? { updateTransforms: transforms } : {}),
    };
  }
  async function runTransaction(handler) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { transaction } = await request(`${root}:beginTransaction`, { options: { readWrite: {} } });
      const writes = []; let writing = false;
      try {
        const tx = {
          get: (ref) => { if (writing) throw new Error("Transaction reads must precede writes"); return get(ref.path, transaction); },
          create: (ref, data) => { writing = true; writes.push(write("create", ref, data)); },
          set: (ref, data) => { writing = true; writes.push(write("set", ref, data)); },
          update: (ref, data) => { writing = true; writes.push(write("update", ref, data)); },
          delete: (ref) => { writing = true; writes.push(write("delete", ref)); },
        };
        const result = await handler(tx);
        await request(`${root}:commit`, { transaction, writes });
        return result;
      } catch (error) {
        await request(`${root}:rollback`, { transaction }).catch(() => undefined);
        if ((error.code === "ABORTED" || error.status === 409) && attempt < 4) { await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 25)); continue; }
        throw error;
      }
    }
    throw new FirestoreRestError("ABORTED", 409);
  }
  async function notificationDevices(userId) {
    const rows = await request(`${root}:runQuery`, { structuredQuery: {
      from: [{ collectionId: "notificationDevices" }],
      select: { fields: [{ fieldPath: "token" }] },
      where: { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: userId } } }, limit: 20,
    } });
    return rows.filter((row) => row.document).map((row) => ({ name: row.document.name, ...decodeFields(row.document.fields ?? {}) }));
  }
  return { doc: document, runTransaction, notificationDevices, removeDevice: (name) => request(name, undefined, "DELETE") };
}
