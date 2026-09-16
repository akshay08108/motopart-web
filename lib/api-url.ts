import { Capacitor } from "@capacitor/core";

const configuredApiBase = process.env.NEXT_PUBLIC_PARTX_API_BASE_URL?.replace(/\/$/, "");
const defaultApiBase = "https://motopart-web.vercel.app";

export function apiUrl(path: string) {
  if (!path.startsWith("/")) throw new Error("PartX API paths must start with '/'.");
  if (typeof window === "undefined") return path;
  if (!Capacitor.isNativePlatform()) return path;
  return `${configuredApiBase || defaultApiBase}${path}`;
}
