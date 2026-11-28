import type { User } from "firebase/auth";

export class PartXAdminError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

type Endpoint = "partxAdmin" | "recordPartXSignIn" | "checkInPartXPresence";

export async function requestPartXAdmin<T>(user: User, endpoint: Endpoint, data: object = {}, signal?: AbortSignal): Promise<T> {
  const base = (process.env.NEXT_PUBLIC_PARTX_DELIVERY_API_URL || "https://partx-delivery-api.akshaysinghkam.workers.dev").replace(/\/$/, "");
  const url = new URL(base);
  const local = process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) throw new Error("PartX needs a secure connection.");
  for (const refresh of [false, true]) {
    const token = await user.getIdToken(refresh);
    const timeout = AbortSignal.timeout(15_000);
    const response = await fetch(`${base}/${endpoint}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data }), cache: "no-store", signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    if (response.status === 401 && !refresh) continue;
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data) throw new PartXAdminError(payload?.error?.message ?? "PartX admin is temporarily unavailable.", response.status, payload?.error?.code);
    return payload.data as T;
  }
  throw new PartXAdminError("Your sign-in session has expired.", 401);
}
