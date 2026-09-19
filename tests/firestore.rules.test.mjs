import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";

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
    await setDoc(doc(database, "users", "customer-2"), {
      roles: ["customer"], activeRole: "customer",
    });
    await setDoc(doc(database, "users", "seller-1"), {
      roles: ["seller"], activeRole: "seller", storeIds: ["store-1", "store-1b"],
    });
    await setDoc(doc(database, "users", "seller-2"), {
      roles: ["seller"], activeRole: "seller", storeIds: ["store-2"],
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
    await setDoc(doc(database, "stores", "store-1b"), {
      ownerId: "seller-1", name: "F1 Automotives", status: "approved",
    });
    await setDoc(doc(database, "stores", "store-2"), {
      ownerId: "seller-2", name: "Other Store", status: "approved",
    });
    await setDoc(doc(database, "vehicleMakes", "tata_motors"), {
      name: "Tata Motors", market: "India",
    });
    await setDoc(doc(database, "vehicleModels", "tata_motors__nexon"), {
      make: "Tata Motors", model: "Nexon", market: "India",
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

test("customer can submit a new UTR without reading a nonexistent reference", async () => {
  const database = environment.authenticatedContext("customer-1").firestore();
  const orderRef = doc(database, "orders", "PRTX-TEST-REFERENCE");
  await assertSucceeds(setDoc(orderRef, pendingUpiOrder()));

  await assertSucceeds(runTransaction(database, async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    const reference = "423456789012";
    transaction.set(doc(database, "paymentReferences", reference), {
      reference,
      orderId: orderRef.id,
      customerId: "customer-1",
      storeId: orderSnapshot.data().storeId,
      status: "PAYMENT_SUBMITTED",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(orderRef, {
      upiTransactionReference: reference,
      paymentReference: reference,
      paymentStatus: "PAYMENT_SUBMITTED",
      orderStatus: "PAYMENT_VERIFICATION_PENDING",
      paymentSubmittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }));
});

test("seller can read a legacy store order even when sellerId is missing", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const legacyOrder = pendingUpiOrder();
    delete legacyOrder.sellerId;
    await setDoc(doc(context.firestore(), "orders", "PRTX-LEGACY-STORE"), legacyOrder);
  });
  const database = environment.authenticatedContext("seller-1").firestore();
  await assertSucceeds(getDoc(doc(database, "orders", "PRTX-LEGACY-STORE")));
});

test("seller can publish, unpublish and remove a store announcement", async () => {
  const database = environment.authenticatedContext("seller-1").firestore();
  const announcementRef = doc(database, "announcements", "announcement-1");
  await assertSucceeds(setDoc(announcementRef, {
    type: "arrival",
    text: "BMW X1 air filters now available",
    sellerId: "seller-1",
    storeId: "store-1",
    storeName: "ARR Autostore",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(announcementRef, { active: false, updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(announcementRef));
});

test("customer cannot publish a seller announcement", async () => {
  const database = environment.authenticatedContext("customer-1").firestore();
  await assertFails(setDoc(doc(database, "announcements", "forged-announcement"), {
    type: "seller",
    text: "Untrusted seller joining soon",
    sellerId: "customer-1",
    storeId: "store-1",
    storeName: "Wrong store",
    active: true,
  }));
});

test("vehicle master data is publicly readable but client writes are denied", async () => {
  const anonymous = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anonymous, "vehicleMakes", "tata_motors")));
  await assertSucceeds(getDoc(doc(anonymous, "vehicleModels", "tata_motors__nexon")));

  const seller = environment.authenticatedContext("seller-1").firestore();
  await assertFails(setDoc(doc(seller, "vehicleModels", "invented-car"), {
    make: "Invented", model: "Car", market: "India",
  }));
});

test("users can register only their own notification devices", async () => {
  const customer = environment.authenticatedContext("customer-1").firestore();
  const deviceRef = doc(customer, "notificationDevices", "device-customer-1");
  await assertSucceeds(setDoc(deviceRef, {
    userId: "customer-1", token: "valid-firebase-registration-token", platform: "web",
    roles: ["customer"], activeRole: "customer", storeIds: [], updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(getDoc(deviceRef));

  const otherCustomer = environment.authenticatedContext("customer-2").firestore();
  await assertFails(getDoc(doc(otherCustomer, "notificationDevices", "device-customer-1")));
  await assertFails(setDoc(doc(otherCustomer, "notificationDevices", "forged-device"), {
    userId: "customer-1", token: "another-valid-registration-token", platform: "web",
    roles: ["customer"], activeRole: "customer", storeIds: [], updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(deleteDoc(deviceRef));
});

test("ticket reaches the selected store and can be resolved only by its seller", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "orders", "ORDER-TICKET-1"), {
      ...pendingUpiOrder(), storeId: "store-1b", storeName: "F1 Automotives", stage: "Delivered",
    });
  });
  const customer = environment.authenticatedContext("customer-1").firestore();
  const ticketRef = doc(customer, "tickets", "TKT-STORE-1B");
  await assertSucceeds(setDoc(ticketRef, {
    id: "TKT-STORE-1B", orderId: "ORDER-TICKET-1", storeId: "store-1b", storeName: "F1 Automotives",
    customerId: "customer-1", customer: { name: "Customer", phone: "9999999999", email: "customer@example.com" },
    issue: "Wrong part received", message: "The delivered part does not match my order.",
    priority: "Urgent", status: "Open", orderedProduct: "Bolt 10 Number",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(getDocs(query(collection(customer, "tickets"), where("customerId", "==", "customer-1"))));

  const owner = environment.authenticatedContext("seller-1").firestore();
  await assertSucceeds(getDocs(query(collection(owner, "tickets"), where("storeId", "==", "store-1b"))));
  await assertSucceeds(updateDoc(doc(owner, "tickets", "TKT-STORE-1B"), {
    status: "Resolved", internalNote: "Replacement arranged", resolvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));

  const otherSeller = environment.authenticatedContext("seller-2").firestore();
  await assertFails(getDoc(doc(otherSeller, "tickets", "TKT-STORE-1B")));
});

test("only the customer can review the delivered order once", async () => {
  const customer = environment.authenticatedContext("customer-1").firestore();
  const rating = {
    id: "ORDER-TICKET-1", orderId: "ORDER-TICKET-1", storeId: "store-1b", storeName: "F1 Automotives",
    customerId: "customer-1", customerName: "Customer", stars: 5, comment: "Correct replacement and helpful service.",
    verified: true, createdAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(customer, "ratings", "ORDER-TICKET-1"), rating));
  await assertSucceeds(getDocs(collection(environment.unauthenticatedContext().firestore(), "ratings")));
  await assertFails(updateDoc(doc(customer, "ratings", "ORDER-TICKET-1"), { stars: 1 }));

  const otherCustomer = environment.authenticatedContext("customer-2").firestore();
  await assertFails(setDoc(doc(otherCustomer, "ratings", "ORDER-TICKET-1"), { ...rating, customerId: "customer-2" }));
});
