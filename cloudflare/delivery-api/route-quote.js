import { DeliveryError } from "../../functions/rider-core.js";
const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
export function createRouteQuote(database, route) {
  const read = async (path) => (await database.doc(path).get()).data();
  return async (uid, input) => {
    const profile = await read(`users/${uid}`);
    const role = profile?.activeRole ?? (profile?.roles?.length === 1 ? profile.roles[0] : null);
    if (input.orderId) {
      if (!validId(input.orderId) || (input.requestId != null && !validId(input.requestId))) throw new DeliveryError("invalid-argument", "Choose a valid order.");
      const order = await read(`orders/${input.orderId}`);
      if (role !== "seller" || !profile.roles?.includes("seller") || order?.sellerId !== uid || !validId(order.storeId)) throw new DeliveryError("permission-denied", "This is not your store's order.");
      const store = await read(`stores/${order.storeId}`);
      if (store?.ownerId !== uid) throw new DeliveryError("permission-denied", "This is not your store.");
      const request = input.requestId == null ? null : await read(`orders/${input.orderId}/afterSales/${input.requestId}`);
      if (input.requestId != null && !request) throw new DeliveryError("not-found", "Return or replacement not found.");
      const customer = request ? request.customerLocation : order.deliveryLocation;
      return request?.kind === "return" ? route(customer, store.location, true) : route(store.location, customer, true);
    }
    if (role !== "customer" || !profile.roles?.includes("customer")) throw new DeliveryError("permission-denied", "Sign in as a customer for a delivery quote.");
    if (!validId(input.storeId) || !["delivery", "garage"].includes(input.fulfilment)) throw new DeliveryError("invalid-argument", "Choose a store and delivery type.");
    const store = await read(`stores/${input.storeId}`);
    if (!store || !["approved", "pending"].includes(store.status)) throw new DeliveryError("not-found", "This store is unavailable.");
    return route(store.location, input.destination);
  };
}
