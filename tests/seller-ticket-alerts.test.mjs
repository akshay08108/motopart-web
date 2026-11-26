import assert from "node:assert/strict";
import { test } from "node:test";
import { createTicketAlertTracker } from "../lib/seller-ticket-alerts.ts";
const ticket = (id, status = "Open", storeId = "store-a") => ({ id, status, storeId });

test("empty cache followed by existing server tickets does not create a login alert", () => {
  const track = createTicketAlertTracker("store-a");
  assert.equal(track([], true), null);
  assert.equal(track([ticket("old")], false), null);
  assert.equal(track([ticket("old"), ticket("new")], false)?.id, "new");
});

test("empty results stay silent; resolved tickets and other stores never trigger alerts", () => {
  const track = createTicketAlertTracker("store-a");
  assert.equal(track([], false), null);
  assert.equal(track([], false), null);
  assert.equal(track([ticket("resolved", "Resolved"), ticket("foreign", "Open", "store-b")], false), null);
  assert.equal(track([ticket("new")], false)?.id, "new");
});

test("cache replays, metadata-only events and document re-additions do not repeat an alert", () => {
  const track = createTicketAlertTracker("store-a");
  track([], false);
  assert.equal(track([ticket("new")], false)?.id, "new");
  assert.equal(track([ticket("new")], true), null);
  assert.equal(track([ticket("new")], false), null);
  assert.equal(track([], false), null);
  assert.equal(track([ticket("new")], false), null);
  assert.equal(track([ticket("new", "Resolved")], false), null);
});

test("each store and new account session establishes its own quiet baseline", () => {
  const first = createTicketAlertTracker("store-a");
  const second = createTicketAlertTracker("store-b");
  first([], false);
  second([], false);
  assert.equal(first([ticket("one")], false)?.id, "one");
  assert.equal(second([ticket("two", "Open", "store-b")], false)?.id, "two");
  const nextSession = createTicketAlertTracker("store-a");
  assert.equal(nextSession([ticket("one")], false), null);
});
