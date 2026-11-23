import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { initializeAccountCart, updateAccountCart, registerCartCheckout } from "../lib/account-cart.ts";
import { removePurchasedItems } from "../lib/cart-checkout.ts";

let environment;
const line = (id, quantity = 1) => ({ product: { id, name: id, partNumber: id, price: 100, stock: 20 }, quantity, storeId: "store", cartEntryId: `entry-${id}` });
const receipt = (item, quantity = item.quantity) => ({ productId: item.product.id, partNumber: item.product.partNumber, quantity, storeId: item.storeId, cartEntryId: item.cartEntryId });
before(async () => {
  environment = await initializeTestEnvironment({ projectId: "demo-partx-cart", firestore: { host: "127.0.0.1", port: 8082, rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") } });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    for (const uid of ["buyer", "other"]) await setDoc(doc(context.firestore(), "users", uid), { roles: ["customer"], activeRole: "customer" });
    await setDoc(doc(context.firestore(), "users", "seller"), { roles: ["seller"], activeRole: "seller" });
  });
});
after(async () => environment?.cleanup());
const client = uid => environment.authenticatedContext(uid).firestore();
const cartRef = database => doc(database, "users", "buyer", "preferences", "cart");

test("independent browser clients receive additions, quantity changes and removals", async () => {
  const desktop = client("buyer"), mobile = client("buyer");
  await initializeAccountCart(desktop, "buyer", [], {});
  let unsubscribe;
  const received = new Promise((resolve, reject) => {
    unsubscribe = onSnapshot(cartRef(mobile), snapshot => {
      if (snapshot.data()?.items?.[0]?.quantity === 2) resolve(snapshot.data().items);
    }, reject);
  });
  await updateAccountCart(desktop, "buyer", () => [line("filter", 2)]);
  assert.equal((await received)[0].quantity, 2);
  unsubscribe();
  await updateAccountCart(mobile, "buyer", items => items.map(item => ({ ...item, quantity: 4 })));
  assert.equal((await getDoc(cartRef(desktop))).data().items[0].quantity, 4);
  await updateAccountCart(mobile, "buyer", () => []);
  assert.deepEqual((await getDoc(cartRef(desktop))).data().items, []);
});

test("simultaneous changes merge against the latest cloud cart", async () => {
  const desktop = client("buyer"), mobile = client("buyer");
  await updateAccountCart(desktop, "buyer", () => []);
  await Promise.all([
    updateAccountCart(desktop, "buyer", items => [...items, line("brakes")]),
    updateAccountCart(mobile, "buyer", items => [...items, line("battery")]),
  ]);
  assert.deepEqual((await getDoc(cartRef(desktop))).data().items.map(item => item.product.id).sort(), ["battery", "brakes"]);
});

test("completed checkout clears once across devices and keeps later additions", async () => {
  const desktop = client("buyer"), mobile = client("buyer");
  const purchased = line("oil", 3);
  await updateAccountCart(desktop, "buyer", () => [purchased, line("extra")]);
  await registerCartCheckout(desktop, "buyer", "order-1", [receipt(purchased, 1)]);
  assert.equal((await getDoc(cartRef(mobile))).data().pendingCheckouts["order-1"][0].productId, "oil");
  await Promise.all([
    updateAccountCart(desktop, "buyer", items => removePurchasedItems(items, [receipt(purchased, 1)]), "order-1"),
    updateAccountCart(mobile, "buyer", items => removePurchasedItems(items, [receipt(purchased, 1)]), "order-1"),
  ]);
  const data = (await getDoc(cartRef(desktop))).data();
  assert.equal(data.items.find(item => item.product.id === "oil").quantity, 2);
  assert.ok(data.items.find(item => item.product.id === "extra"));
  assert.equal(data.pendingCheckouts["order-1"], undefined);
  assert.equal(data.appliedCheckouts.filter(id => id === "order-1").length, 1);
});

test("an empty cloud cart cannot be resurrected from an older browser cache", async () => {
  const database = client("buyer");
  await updateAccountCart(database, "buyer", () => []);
  await initializeAccountCart(database, "buyer", [line("stale")], {});
  assert.deepEqual((await getDoc(cartRef(database))).data().items, []);
});

test("another customer, seller and signed-out browser cannot access the cart", async () => {
  for (const database of [client("other"), client("seller"), environment.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(cartRef(database)));
    await assertFails(setDoc(cartRef(database), { items: [], pendingCheckouts: {}, appliedCheckouts: [], updatedAt: serverTimestamp() }));
  }
  await assertFails(setDoc(doc(client("seller"), "users", "seller", "preferences", "cart"), { items: [], pendingCheckouts: {}, appliedCheckouts: [], updatedAt: serverTimestamp() }));
});

test("cart rules reject unsupported fields and oversized payloads", async () => {
  const database = client("buyer");
  await assertFails(setDoc(cartRef(database), { items: [], pendingCheckouts: {}, appliedCheckouts: [], updatedAt: serverTimestamp(), roles: ["seller"] }));
  await assertFails(setDoc(cartRef(database), { items: Array.from({ length: 101 }, (_, i) => line(String(i))), pendingCheckouts: {}, appliedCheckouts: [], updatedAt: serverTimestamp() }));
});
