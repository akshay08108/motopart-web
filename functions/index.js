import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2/options";

initializeApp();
setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

const database = getFirestore();

async function sendToUser(userId, message) {
  if (!userId) return;
  const snapshot = await database.collection("notificationDevices").where("userId", "==", userId).get();
  if (snapshot.empty) return;
  const documents = snapshot.docs.filter((device) => typeof device.data().token === "string");
  const tokens = documents.map((device) => device.data().token);
  if (!tokens.length) return;
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    data: {
      title: String(message.title),
      body: String(message.body),
      link: String(message.link || "/"),
      tag: String(message.tag || "partx-update"),
    },
    webpush: { fcmOptions: { link: String(message.link || "/") } },
    android: { priority: "high" },
  });
  const invalidCodes = new Set([
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
  ]);
  await Promise.all(response.responses.map((result, index) => {
    if (result.success || !invalidCodes.has(result.error?.code)) return undefined;
    return documents[index].ref.delete();
  }));
}

export const notifySellerOfNewOrder = onDocumentCreated("orders/{orderId}", async (event) => {
  const order = event.data?.data();
  if (!order || !order.sellerId) return;
  if (order.orderStatus !== "PLACED" && order.paymentStatus !== "PAYMENT_DUE" && order.paymentStatus !== "PAID") return;
  const itemCount = Array.isArray(order.items) ? order.items.length : 1;
  await sendToUser(order.sellerId, {
    title: "New PartX order",
    body: `${order.id || event.params.orderId}: ${itemCount} product${itemCount === 1 ? "" : "s"} to prepare`,
    link: `/seller/orders/${event.params.orderId}`,
    tag: `order-${event.params.orderId}`,
  });
});

export const notifyOnOrderUpdate = onDocumentUpdated("orders/{orderId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const tasks = [];
  if (before.paymentStatus !== after.paymentStatus && after.paymentStatus === "PAYMENT_SUBMITTED") {
    tasks.push(sendToUser(after.sellerId, {
      title: "Verify a PartX payment",
      body: `Order ${event.params.orderId} has a new UPI reference to verify.`,
      link: "/seller/payments",
      tag: `payment-${event.params.orderId}`,
    }));
  }
  if (before.paymentStatus !== after.paymentStatus && after.paymentStatus === "PAID") {
    tasks.push(sendToUser(after.customerId, {
      title: "Payment confirmed",
      body: `${after.storeName || "Your seller"} confirmed payment for order ${event.params.orderId}.`,
      link: `/orders/${event.params.orderId}`,
      tag: `order-${event.params.orderId}`,
    }));
  }
  if (before.stage !== after.stage && after.stage) {
    tasks.push(sendToUser(after.customerId, {
      title: `Order ${String(after.stage).toLowerCase()}`,
      body: `${after.storeName || "Your seller"} updated order ${event.params.orderId}.`,
      link: `/orders/${event.params.orderId}`,
      tag: `order-${event.params.orderId}`,
    }));
  }
  await Promise.all(tasks);
});

export const notifySellerOfTicket = onDocumentCreated("tickets/{ticketId}", async (event) => {
  const ticket = event.data?.data();
  if (!ticket?.storeId) return;
  const store = await database.doc(`stores/${ticket.storeId}`).get();
  const ownerId = store.data()?.ownerId;
  await sendToUser(ownerId, {
    title: ticket.priority === "Urgent" ? "Urgent PartX support ticket" : "New PartX support ticket",
    body: `${ticket.issue || "Order issue"} · Order ${ticket.orderId || ""}`,
    link: `/seller/tickets?order=${encodeURIComponent(ticket.orderId || "")}`,
    tag: `ticket-${event.params.ticketId}`,
  });
});

export const notifyCustomerOfResolvedTicket = onDocumentUpdated("tickets/{ticketId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === after.status || after.status !== "Resolved") return;
  await sendToUser(after.customerId, {
    title: "Your PartX ticket was resolved",
    body: `${after.storeName || "The seller"} resolved your ${after.issue || "support"} ticket.`,
    link: `/support?order=${encodeURIComponent(after.orderId || "")}`,
    tag: `ticket-${event.params.ticketId}`,
  });
});
