import assert from "node:assert/strict";
import { test } from "node:test";
import { createPushRegistration, pushRegistrationError } from "../lib/push-registration.ts";

function fixture() {
  let userId = "customer"; let owner = null; let token = "token-0"; let generation = 0;
  const devices = new Map(); const revoked = []; const deletions = [];
  const transport = {
    getToken: async () => token,
    revokeToken: async () => { revoked.push(token); token = `token-${++generation}`; },
    deviceId: async (value, uid) => `${uid}:${value}`,
    saveDevice: async (id, user, value) => {
      if (devices.has(id) && devices.get(id).userId !== userId) throw Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" });
      if (user.id !== userId) throw new Error("Wrong account");
      devices.set(id, { userId: user.id, token: value });
    },
    deleteDevice: async (id) => { deletions.push(id); if (devices.get(id)?.userId !== userId) throw new Error("Not the owner"); devices.delete(id); },
  };
  const manager = createPushRegistration({ currentUserId: () => userId, readOwner: () => owner, writeOwner: (value) => { owner = value; }, loadTransport: async () => transport });
  return { manager, devices, revoked, deletions, transport, switchTo: (value) => { userId = value; }, owner: () => owner };
}
const user = (id) => ({ id, name: id, email: `${id}@partx.test`, roles: [id], activeRole: id, storeIds: [] });

test("switching from customer to seller retires the old token and creates an account-specific record", async () => {
  const f = fixture();
  await f.manager.register(user("customer"));
  const first = f.owner();
  f.switchTo("seller");
  await f.manager.register(user("seller"));
  assert.equal(f.owner().userId, "seller");
  assert.notEqual(f.owner().deviceId, first.deviceId);
  assert.ok(f.revoked.includes(f.devices.get(first.deviceId).token));
  assert.equal(f.deletions.includes(first.deviceId), false, "do not delete another account's record");
  assert.equal(f.devices.get(f.owner().deviceId).userId, "seller");
});
test("logout waits for registration, removes its own device and revokes the token", async () => {
  const f = fixture();
  await Promise.all([f.manager.register(user("customer")), f.manager.unregister("customer")]);
  assert.equal(f.devices.size, 0);
  assert.equal(f.owner(), null);
  assert.equal(f.revoked.length, 2);
});
test("an in-flight old account registration cannot save over the newly signed-in account", async () => {
  const f = fixture();
  const getToken = f.transport.getToken;
  let release; let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  f.transport.getToken = async () => { entered(); await new Promise((resolve) => { release = resolve; }); f.transport.getToken = getToken; return getToken(); };
  const old = f.manager.register(user("customer"));
  const rejected = assert.rejects(old, /account changed/);
  await started; f.switchTo("seller"); const next = f.manager.register(user("seller")); release();
  await rejected; await next;
  assert.equal(f.devices.size, 1);
  assert.equal(f.owner().userId, "seller");
});
test("notification failures are contextual rather than raw Firebase permission messages", () => {
  const message = pushRegistrationError({ code: "firestore/permission-denied", message: "Missing or insufficient permissions." });
  assert.match(message, /Notification setup/);
  assert.match(message, /retry/);
  assert.doesNotMatch(message, /Missing or insufficient/);
});
