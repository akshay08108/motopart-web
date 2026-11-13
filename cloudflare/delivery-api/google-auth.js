import { DeliveryError } from "../../functions/rider-core.js";

const encoder = new TextEncoder();
const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
function decode64(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid token encoding");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (character) => character.charCodeAt(0));
}
export function readServiceAccount(env) {
  try {
    const credential = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT ?? "null");
    if (!/^[a-z][a-z0-9-]{4,62}$/.test(env.FIREBASE_PROJECT_ID ?? "") || !credential || credential.project_id !== env.FIREBASE_PROJECT_ID || !credential.client_email?.endsWith(".iam.gserviceaccount.com") || !credential.private_key?.includes("BEGIN PRIVATE KEY")) throw new Error();
    return credential;
  } catch { throw new DeliveryError("unavailable", "The delivery service is awaiting its secure Firebase configuration."); }
}

export function createGoogleAuth(fetcher = fetch) {
  let keyCache = { expiresAt: 0, fetchedAt: 0, keys: [] };
  const verificationKeys = new Map();
  let accessCache = { credential: "", value: "", expiresAt: 0 };
  let signingKey;
  let signingKeySource;
  async function verifyFirebaseToken(token, projectId, verifiedEmailRequired = false) {
    try {
      if (typeof token !== "string" || token.length > 8192) throw new Error();
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error();
      const header = JSON.parse(new TextDecoder().decode(decode64(parts[0])));
      if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error();
      if (Date.now() >= keyCache.expiresAt || (!keyCache.keys.some((key) => key.kid === header.kid) && Date.now() - keyCache.fetchedAt > 60000)) {
        const response = await fetcher("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new DeliveryError("unavailable", "Sign-in verification is temporarily unavailable.");
        const data = await response.json();
        keyCache = { keys: data.keys ?? [], fetchedAt: Date.now(), expiresAt: Date.now() + Math.min(Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600), 21600) * 1000 };
        verificationKeys.clear();
      }
      const jwk = keyCache.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
      if (!jwk) throw new Error();
      let key = verificationKeys.get(header.kid);
      if (!key) { key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]); verificationKeys.set(header.kid, key); }
      if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode64(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) throw new Error();
      const payload = JSON.parse(new TextDecoder().decode(decode64(parts[1])));
      const now = Math.floor(Date.now() / 1000);
      if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128 || typeof payload.exp !== "number" || payload.exp <= now || typeof payload.iat !== "number" || payload.iat > now + 30 || typeof payload.auth_time !== "number" || payload.auth_time > now + 30) throw new Error();
      if (verifiedEmailRequired && payload.email_verified !== true) throw new DeliveryError("permission-denied", "Verify your email before continuing.");
      return payload.sub;
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      throw new DeliveryError("unauthenticated", "Your sign-in session is invalid or expired. Sign in again.");
    }
  }
  async function accessToken(env) {
    const credential = readServiceAccount(env);
    if (accessCache.credential === env.FIREBASE_SERVICE_ACCOUNT && accessCache.expiresAt > Date.now() + 60000) return accessCache.value;
    if (signingKeySource !== credential.private_key) {
      const der = Uint8Array.from(atob(credential.private_key.replace(/-----[^-]+-----|\s/g, "")), (character) => character.charCodeAt(0));
      signingKey = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
      signingKeySource = credential.private_key;
    }
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT", ...(credential.private_key_id ? { kid: credential.private_key_id } : {}) })));
    const claims = base64url(encoder.encode(JSON.stringify({ iss: credential.client_email, scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
    const unsigned = `${header}.${claims}`;
    const signature = base64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, encoder.encode(unsigned)));
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }), signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok || typeof result.access_token !== "string") throw new DeliveryError("unavailable", "Firebase backend access is unavailable. Contact PartX operations.");
    accessCache = { credential: env.FIREBASE_SERVICE_ACCOUNT, value: result.access_token, expiresAt: Date.now() + Math.min(result.expires_in ?? 3600, 3600) * 1000 };
    return accessCache.value;
  }
  return { verifyFirebaseToken, accessToken };
}
