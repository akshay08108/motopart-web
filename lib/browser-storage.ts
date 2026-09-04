type BrowserStorageKind = "local" | "session";

function getBrowserStorage(kind: BrowserStorageKind) {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readBrowserStorage(kind: BrowserStorageKind, key: string) {
  try {
    return getBrowserStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeBrowserStorage(kind: BrowserStorageKind, key: string, value: string) {
  try {
    getBrowserStorage(kind)?.setItem(key, value);
  } catch {
    // Storage can be unavailable in Safari private mode and embedded browsers.
  }
}

export function removeBrowserStorage(kind: BrowserStorageKind, key: string) {
  try {
    getBrowserStorage(kind)?.removeItem(key);
  } catch {
    // The app should continue with an in-memory session when storage is blocked.
  }
}
