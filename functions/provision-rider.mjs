// Run only by PartX operations with Application Default Credentials.
// No service-account key is stored in the application or browser.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const equals = argument.indexOf("=");
  return [argument.slice(2, equals), argument.slice(equals + 1)];
}));
if (!args.email || !args.name || !args.phone || !args.project) {
  throw new Error('Usage: node functions/provision-rider.mjs --project=partx-production --email=rider@example.com --name="Rider name" --phone=+919876543210');
}
initializeApp({ credential: applicationDefault(), projectId: args.project });
const database = getFirestore(); const auth = getAuth();
let account;
try { account = await auth.getUserByEmail(args.email); }
catch (error) { if (error.code !== "auth/user-not-found") throw error; }
let existingProfile;
if (account) {
  const profile = (await database.doc(`users/${account.uid}`).get()).data();
  existingProfile = profile;
  if (profile?.roles?.some((role) => role !== "rider")) throw new Error("Use a separate email for the rider. Existing customer and seller accounts will not be converted.");
}
if (existingProfile?.riderSelfRegistered && !account.emailVerified) {
  throw new Error("Ask the rider to verify their email before activating delivery access.");
}
let created = false;
try {
  if (!account) { account = await auth.createUser({ email: args.email, displayName: args.name }); created = true; }
  await database.runTransaction(async (tx) => {
    const riderRef = database.doc(`riders/${account.uid}`);
    const current = (await tx.get(riderRef)).data();
    tx.set(database.doc(`users/${account.uid}`), { name: args.name, email: args.email, mobile: args.phone, roles: ["rider"], activeRole: "rider", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(riderRef, { name: args.name, phone: args.phone, active: true, activationPending: false, online: current?.online ?? false, activeDeliveryId: current?.activeDeliveryId ?? null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  console.log(existingProfile?.riderSelfRegistered
    ? `Rider ${account.uid} is active. They can sign in with their existing password.`
    : `Rider ${account.uid} is ready. They can use Forgot password at /login/rider to set or reset their password.`);
} catch (error) {
  if (created && account) await auth.deleteUser(account.uid);
  throw error;
}
