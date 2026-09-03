import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";

const projectId = "demo-partx-rules";
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
  });

  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, "users", "customer-1"), {
      roles: ["customer"], activeRole: "customer",
    });
    await setDoc(doc(database, "users", "seller-1"), {
      roles: ["seller"], activeRole: "seller", storeIds: ["store-1"],
    });
    await setDoc(doc(database, "stores", "store-1"), {
      ownerId: "seller-1",
      name: "ARR Autostore",
      status: "approved",
      paymentSettings: {
        upiId: "arr.autostore@ybl",
        upiDisplayName: "ARR Autostore",
        upiEnabled: true,
        codEnabled: true,
      },
    });
  });
});

after(async () => {
  await environment?.cleanup();
});

function pendingUpiOrder(customerId = "customer-1") {
  return {
    customerId,
    sellerId: "seller-1",
    customer: { name: "Customer", phone: "", email: "customer@example.com" },
    trackingId: "TRK-TEST",
    storeId: "store-1",
    storeName: "ARR Autostore",
    placedAt: "Just now",
    eta: "Waiting for payment verification",
    stage: "Confirmed",
    status: "New",
    subtotal: 1,
    deliveryCharge: 0,
    discount: 0,
    total: 1,
    totalAmount: 1,
    currency: "INR",
    fulfilment: "pickup",
    paymentStatus: "PENDING",
    paymentMethod: "upi",
    paymentMode: "live",
    orderStatus: "PAYMENT_PENDING",
    sellerUpiIdSnapshot: "arr.autostore@ybl",
    sellerUpiNameSnapshot: "ARR Autostore",
    expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60_000),
    deadline: "Ready within 45 minutes",
    productName: "Bolt 10 Number",
    partNumber: "BOLT233",
    quantity: 1,
    items: [{
      productId: "product-1", productName: "Bolt 10 Number", partNumber: "BOLT233",
      quantity: 1, unitPrice: 1, storeId: "store-1", storeName: "ARR Autostore",
    }],
    itemQuantities: { "product-1": 1 },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

test("customer can create an ARR-style pending UPI order", async () => {
  const database = environment.authenticatedContext("customer-1").firestore();
  await assertSucceeds(setDoc(doc(database, "orders", "PRTX-TEST-CUSTOMER"), pendingUpiOrder()));
});

test("seller cannot use customer checkout to create an order", async () => {
  const database = environment.authenticatedContext("seller-1").firestore();
  await assertFails(setDoc(doc(database, "orders", "PRTX-TEST-SELLER"), pendingUpiOrder("seller-1")));
});
