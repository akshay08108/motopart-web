import type { UserRole } from "./types";

const assets: Record<UserRole, string> = {
  customer: "PartX-Customer.apk",
  seller: "PartX-Seller.apk",
  rider: "PartX-Rider.apk",
};

export function availableAndroidUpdate(manifest: unknown, role: UserRole, installedBuild: string) {
  if (!/^\d+$/.test(installedBuild) || !manifest || typeof manifest !== "object") return null;
  const installedVersion = Number(installedBuild);
  if (!Number.isSafeInteger(installedVersion) || installedVersion < 1) return null;

  const entry = (manifest as Record<string, unknown>)[role];
  if (!entry || typeof entry !== "object") return null;
  const { versionCode, versionName } = entry as Record<string, unknown>;
  if (typeof versionCode !== "number" || !Number.isSafeInteger(versionCode) || versionCode <= installedVersion) return null;
  if (typeof versionName !== "string" || !/^[\w.-]{1,24}$/.test(versionName)) return null;

  return {
    versionCode,
    versionName,
    downloadUrl: `https://github.com/akshay08108/motopart-web/releases/download/android-${role}-${versionCode}/${assets[role]}`,
  };
}
