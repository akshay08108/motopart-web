import type { CustomerUser } from "./types";

type DeviceOwner = { userId: string; deviceId: string };
type PushTransport = {
  getToken: () => Promise<string>;
  revokeToken: () => Promise<void>;
  deviceId: (token: string, userId: string) => Promise<string>;
  saveDevice: (id: string, user: CustomerUser, token: string) => Promise<void>;
  deleteDevice: (id: string) => Promise<void>;
};
type PushDependencies = {
  currentUserId: () => string | undefined;
  readOwner: () => DeviceOwner | null;
  writeOwner: (owner: DeviceOwner | null) => void;
  loadTransport: () => Promise<PushTransport>;
};

export function createPushRegistration(dependencies: PushDependencies) {
  let pending: Promise<void> = Promise.resolve();
  function queue(task: () => Promise<void>) {
    const result = pending.then(task);
    pending = result.catch(() => undefined);
    return result;
  }
  const requireUser = (userId: string) => {
    if (dependencies.currentUserId() !== userId) throw new Error("Your account changed. Enable notifications again for the signed-in account.");
  };
  return {
    register: (user: CustomerUser) => queue(async () => {
      requireUser(user.id);
      const transport = await dependencies.loadTransport();
      let token = await transport.getToken();
      if (!token) throw new Error("Firebase did not return a notification registration.");
      const previous = dependencies.readOwner();
      requireUser(user.id);
      if (previous?.userId !== user.id) {
        // A token belongs to one signed-in account. Retire the legacy/current
        // subscription before switching owners instead of overwriting their record.
        await transport.revokeToken();
        requireUser(user.id);
        // Do not touch the previous account's document. FCM rejects its retired
        // token and the existing server notification handler removes that record.
        token = await transport.getToken();
        if (!token) throw new Error("Firebase did not return a notification registration.");
      }
      requireUser(user.id);
      const id = await transport.deviceId(token, user.id);
      await transport.saveDevice(id, user, token);
      requireUser(user.id);
      if (previous?.userId === user.id && previous.deviceId !== id) await transport.deleteDevice(previous.deviceId).catch(() => undefined);
      dependencies.writeOwner({ userId: user.id, deviceId: id });
    }),
    unregister: (userId: string) => queue(async () => {
      if (dependencies.currentUserId() !== userId) return;
      const transport = await dependencies.loadTransport();
      const previous = dependencies.readOwner();
      await transport.getToken();
      requireUser(userId);
      if (previous?.userId === userId) await transport.deleteDevice(previous.deviceId).catch(() => undefined);
      await transport.revokeToken();
      if (dependencies.readOwner()?.userId === userId) dependencies.writeOwner(null);
    }),
  };
}

export function pushRegistrationError(reason: unknown) {
  const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
  if (code.includes("permission-denied")) return "Notification setup was denied for this account. Select Enable alerts to retry.";
  if (code.includes("network") || code.includes("unavailable")) return "Could not reach the notification service. Check your connection and enable alerts again.";
  if (code.includes("permission-blocked")) return "Notifications are blocked in your browser’s site settings.";
  return "Notifications could not be enabled for this account. Select Enable alerts to retry.";
}
