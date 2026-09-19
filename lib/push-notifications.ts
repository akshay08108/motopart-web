import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import type { CustomerUser } from "@/lib/types";
import { firebaseApp, firestore } from "@/lib/firebase";

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

async function tokenDocumentId(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function registerPushNotifications(user: CustomerUser): Promise<PushRegistrationResult> {
  if (!supportedByBrowser()) return { enabled: false, reason: "Push notifications are not supported by this browser." };

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    return { enabled: false, reason: permission === "denied" ? "Notifications are blocked in this browser's site settings." : "Notification permission was not granted." };
  }

  try {
    const [{ getMessaging, getToken, isSupported }] = await Promise.all([import("firebase/messaging")]);
    if (!await isSupported()) return { enabled: false, reason: "Firebase notifications are not supported on this device." };
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(getMessaging(firebaseApp), { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { enabled: false, reason: "Firebase did not return a notification registration." };
    const deviceId = await tokenDocumentId(token);
    await setDoc(doc(firestore, "notificationDevices", deviceId), {
      userId: user.id,
      token,
      platform: "web",
      roles: user.roles,
      activeRole: user.activeRole,
      storeIds: user.storeIds ?? [],
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { enabled: true };
  } catch (reason) {
    return { enabled: false, reason: reason instanceof Error ? reason.message : "PartX could not enable notifications." };
  }
}

export async function unregisterPushNotifications() {
  if (!supportedByBrowser() || Notification.permission !== "granted") return;
  try {
    const { deleteToken, getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if (!await isSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return;
    const deviceId = await tokenDocumentId(token);
    await deleteDoc(doc(firestore, "notificationDevices", deviceId)).catch(() => undefined);
    await deleteToken(messaging).catch(() => undefined);
  } catch {
    // Signing out must still succeed if the browser has already revoked push access.
  }
}

export function browserNotificationPermission(): NotificationPermission | "unsupported" {
  return supportedByBrowser() ? Notification.permission : "unsupported";
}
