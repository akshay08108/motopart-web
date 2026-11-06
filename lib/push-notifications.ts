import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import type { CustomerUser } from "@/lib/types";
import { firebaseApp, firebaseAuth, firestore } from "@/lib/firebase";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { createPushRegistration, pushRegistrationError } from "./push-registration";

const fallbackVapidKey = "BJupIemRl8Ymm4eWH0g13mjVgdaWfxz3avzehnW7T0XyVBmzP8sG-SuLxxXKv8N8SVDB68xQ743Ck8JsPaoDC5E";
const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || fallbackVapidKey;

export type PushRegistrationResult =
  | { enabled: true }
  | { enabled: false; reason: string };

function supportedByBrowser() {
  return typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

async function tokenDocumentId(token: string, userId: string) {
  const bytes = new TextEncoder().encode(`${userId}:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

const ownerKey = "partx-push-owner-v2";
const registrationManager = createPushRegistration({
  currentUserId: () => firebaseAuth.currentUser?.uid,
  readOwner: () => {
    try { const value = JSON.parse(readBrowserStorage("local", ownerKey) ?? "null"); return typeof value?.userId === "string" && typeof value?.deviceId === "string" ? value : null; } catch { return null; }
  },
  writeOwner: (owner) => { if (owner) writeBrowserStorage("local", ownerKey, JSON.stringify(owner)); else removeBrowserStorage("local", ownerKey); },
  loadTransport: async () => {
    const { getMessaging, getToken, deleteToken, isSupported } = await import("firebase/messaging");
    if (!await isSupported()) throw new Error("Firebase notifications are not supported on this device.");
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(firebaseApp);
    return {
      getToken: () => getToken(messaging, { vapidKey, serviceWorkerRegistration: registration }),
      revokeToken: async () => { await deleteToken(messaging); },
      deviceId: tokenDocumentId,
      saveDevice: (id, user, token) => setDoc(doc(firestore, "notificationDevices", id), { userId: user.id, token, platform: "web", roles: user.roles, activeRole: user.activeRole, storeIds: user.storeIds ?? [], updatedAt: serverTimestamp() }, { merge: true }),
      deleteDevice: (id) => deleteDoc(doc(firestore, "notificationDevices", id)),
    };
  },
});

export async function registerPushNotifications(user: CustomerUser): Promise<PushRegistrationResult> {
  if (!supportedByBrowser()) return { enabled: false, reason: "Push notifications are not supported by this browser." };

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    return { enabled: false, reason: permission === "denied" ? "Notifications are blocked in this browser's site settings." : "Notification permission was not granted." };
  }

  try {
    await registrationManager.register(user);
    return { enabled: true };
  } catch (reason) {
    return { enabled: false, reason: pushRegistrationError(reason) };
  }
}

export async function unregisterPushNotifications(userId: string) {
  if (!supportedByBrowser() || Notification.permission !== "granted") return;
  try {
    await registrationManager.unregister(userId);
  } catch {
    // Signing out must still succeed if the browser has already revoked push access.
  }
}

export function browserNotificationPermission(): NotificationPermission | "unsupported" {
  return supportedByBrowser() ? Notification.permission : "unsupported";
}
