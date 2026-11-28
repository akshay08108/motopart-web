import assert from "node:assert/strict";
import { test } from "node:test";
import { canBrowseAsGuest, isGuestAccountPage, mergeGuestCart } from "../lib/customer-guest.ts";

test("guest storefront access covers web and native products without opening account or role pages", () => {
  for (const path of ["/", "/shop", "/shop/air-filter", "/product", "/cart", "/offers"]) {
    assert.equal(canBrowseAsGuest(path), true, path);
  }
  for (const path of ["/checkout", "/account", "/garage", "/orders", "/orders/example", "/order", "/support"]) {
    assert.equal(canBrowseAsGuest(path), false, path);
    assert.equal(isGuestAccountPage(path), true, path);
  }
  for (const path of ["/seller", "/seller/orders", "/rider", "/admin", "/shop-private"]) {
    assert.equal(canBrowseAsGuest(path), false, path);
    assert.equal(isGuestAccountPage(path), false, path);
  }
});

function line(id, partNumber, storeId, quantity) {
  return { product: { id, partNumber }, storeId, quantity, cartEntryId: id };
}

test("guest transfer preserves account seller choices and is idempotent on retry", () => {
  const filter = line("account-filter", "AF1", "store-1", 1);
  const battery = line("account-battery", "BT1", "store-1", 2);
  const guest = [
    line("guest-filter", " af1 ", "store-1", 3),
    line("guest-battery", "BT1", "store-2", 4),
    line("guest-brakes", "BR1", "store-2", 1),
  ];
  const merged = mergeGuestCart([filter, battery], guest);
  assert.deepEqual(merged, [{ ...filter, quantity: 3 }, battery, guest[2]]);
  assert.deepEqual(mergeGuestCart(merged, guest), merged);
});

test("guest transfer stays within the existing account cart limit", () => {
  const accountItems = Array.from({ length: 99 }, (_, i) => line(`account-${i}`, `PART${i}`, "s1", 1));
  const guest = [line("guest-1", "a", "s2", 1), line("guest-2", "b", "s2", 1)];
  assert.equal(mergeGuestCart(accountItems, guest).length, 100);
});
