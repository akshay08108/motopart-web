"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import type { NewSellerProduct, SellerOrder, SellerOrderStatus, SellerPaymentStatus, SellerProduct, SellerTicket, StorePaymentSettings, StoreRating } from "@/lib/types";
import { createPartXId, sellerTicketsSeed, storeRatingsSeed } from "@/lib/seller-data";
import { deleteCloudinaryProductImage, uploadProductImageToCloudinary } from "@/lib/cloudinary-client";
import { firestore } from "@/lib/firebase";
import { usePartX } from "./app-provider";
import { isValidUpiId } from "@/lib/upi-payments";

type NewTicket = Pick<SellerTicket, "orderId" | "issue" | "message"> & { customer?: SellerTicket["customer"] };
type SellerAlert = { kind: "order"; order: SellerOrder } | { kind: "payment"; order: SellerOrder } | { kind: "ticket"; ticket: SellerTicket };

type SellerContextValue = {
  sellerOrders: SellerOrder[];
  paymentVerifications: SellerOrder[];
  paymentSettings: StorePaymentSettings | null;
  tickets: SellerTicket[];
  ratings: StoreRating[];
  alertsEnabled: boolean;
  activeAlert: SellerAlert | null;
  enableAlerts: () => void;
  dismissAlert: () => void;
  updateOrderStatus: (orderId: string, status: SellerOrderStatus) => Promise<void>;
  savePaymentSettings: (settings: StorePaymentSettings) => Promise<void>;
  confirmPayment: (orderId: string) => Promise<void>;
  markPaymentNotFound: (orderId: string) => Promise<void>;
  addTicket: (ticket: NewTicket) => SellerTicket;
  resolveTicket: (ticketId: string, internalNote: string) => void;
  addRating: (rating: Omit<StoreRating, "id" | "createdAt" | "verified">) => StoreRating;
  updateProduct: (partNumber: string, price: number, stock: number) => void;
  productOverrides: Record<string, { price: number; stock: number }>;
  sellerProducts: SellerProduct[];
  addProduct: (product: NewSellerProduct, image?: File) => Promise<void>;
  addProducts: (products: NewSellerProduct[]) => Promise<void>;
  updateSellerProduct: (productId: string, sellingPrice: number, stock: number) => Promise<void>;
  uploadProductImage: (productId: string, image: File, onProgress?: (progress: number) => void) => Promise<void>;
};

const SellerContext = createContext<SellerContextValue | null>(null);

const customerStageForSellerStatus = {
  New: "Confirmed",
  Accepted: "Preparing",
  Packing: "Preparing",
  Packed: "Preparing",
  Dispatched: "On the way",
  Delivered: "Delivered",
} as const;

function playFiveSecondAlert(context: AudioContext) {
  if (context.state !== "running") return;
  const started = context.currentTime;
  for (let index = 0; index < 5; index += 1) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = index % 2 ? 760 : 620;
    gain.gain.setValueAtTime(0.0001, started + index);
    gain.gain.exponentialRampToValueAtTime(0.14, started + index + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, started + index + 0.55);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(started + index); oscillator.stop(started + index + 0.6);
  }
}

function resumeAndPlayAlert(context: AudioContext) {
  void context.resume().then(() => playFiveSecondAlert(context)).catch(() => undefined);
}

export function SellerProvider({ children }: { children: React.ReactNode }) {
  const { updateOrderStage, user } = usePartX();
  const [sellerOrders, setSellerOrders] = useState<SellerOrder[]>([]);
  const [paymentVerifications, setPaymentVerifications] = useState<SellerOrder[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<StorePaymentSettings | null>(null);
  const [tickets, setTickets] = useState<SellerTicket[]>(sellerTicketsSeed);
  const [ratings, setRatings] = useState<StoreRating[]>(storeRatingsSeed);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [activeAlert, setActiveAlert] = useState<SellerAlert | null>(null);
  const [productOverrides, setProductOverrides] = useState<Record<string, { price: number; stock: number }>>({
    "BP-0986-424-384": { price: 1299, stock: 3 }, "LX-3541": { price: 649, stock: 12 }, MTRED60L: { price: 4999, stock: 2 }, "3397011417": { price: 799, stock: 4 }, "OC-523": { price: 259, stock: 0 },
  });
  const [sellerProducts, setSellerProducts] = useState<SellerProduct[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const alertsEnabledRef = useRef(false);
  const sellerOrdersRef = useRef<SellerOrder[]>([]);
  const alertAudioRef = useRef<AudioContext | null>(null);
  const sellerStoreIdsKey = user?.activeRole === "seller" ? (user.storeIds ?? []).join("|") : "";

  useEffect(() => {
    alertsEnabledRef.current = alertsEnabled;
  }, [alertsEnabled]);

  useEffect(() => {
    if (!user?.id || user.activeRole !== "seller") return;
    return onSnapshot(
      query(collection(firestore, "products"), where("sellerId", "==", user.id)),
      (snapshot) => setSellerProducts(snapshot.docs.map((productDoc) => ({ id: productDoc.id, ...productDoc.data() } as SellerProduct))),
      () => setSellerProducts([]),
    );
  }, [user?.activeRole, user?.id]);

  useEffect(() => {
    const storeId = sellerStoreIdsKey.split("|")[0];
    if (!storeId) return;
    const storeName = user?.storeName ?? "";
    return onSnapshot(doc(firestore, "stores", storeId), (snapshot) => {
      const settings = snapshot.data()?.paymentSettings;
      setPaymentSettings(settings && typeof settings === "object" ? {
        upiId: String(settings.upiId ?? ""),
        upiDisplayName: String(settings.upiDisplayName ?? storeName),
        upiEnabled: settings.upiEnabled === true,
        codEnabled: settings.codEnabled === true,
      } : { upiId: "", upiDisplayName: storeName, upiEnabled: false, codEnabled: true });
    }, () => setPaymentSettings(null));
  }, [sellerStoreIdsKey, user?.storeName]);

  useEffect(() => {
    const storeIds = sellerStoreIdsKey.split("|").filter(Boolean);
    if (!storeIds.length) {
      sellerOrdersRef.current = [];
      queueMicrotask(() => { setSellerOrders([]); setPaymentVerifications([]); });
      return;
    }

    const ordersByStore = new Map<string, FirestoreSellerOrder[]>();
    const initializedStores = new Set<string>();
    const refreshOrders = () => {
      const liveOrders = [...ordersByStore.values()].flat().sort((a, b) => firestoreTime(b.createdAt) - firestoreTime(a.createdAt));
      const fulfilmentOrders = liveOrders.filter(isFulfilmentOrder);
      sellerOrdersRef.current = fulfilmentOrders;
      setSellerOrders(fulfilmentOrders);
      setPaymentVerifications(liveOrders.filter((order) => order.paymentStatus === "PAYMENT_SUBMITTED" || order.paymentStatus === "VERIFICATION_FAILED"));
    };

    const unsubscribers = storeIds.map((storeId) => onSnapshot(
      query(collection(firestore, "orders"), where("storeId", "==", storeId), where("sellerId", "==", user!.id)),
      (snapshot) => {
        ordersByStore.set(storeId, snapshot.docs.map((orderDoc) => toSellerOrder(orderDoc.id, orderDoc.data())));
        refreshOrders();
        if (initializedStores.has(storeId)) {
          const incomingChange = snapshot.docChanges().find((change) => change.type === "added" || (change.type === "modified" && change.doc.data().paymentStatus === "PAYMENT_SUBMITTED"));
          if (incomingChange) {
            const incoming = toSellerOrder(incomingChange.doc.id, incomingChange.doc.data());
            if (isFulfilmentOrder(incoming)) setActiveAlert({ kind: "order", order: incoming });
            else if (incoming.paymentStatus === "PAYMENT_SUBMITTED") setActiveAlert({ kind: "payment", order: incoming });
            if ((isFulfilmentOrder(incoming) || incoming.paymentStatus === "PAYMENT_SUBMITTED") && alertsEnabledRef.current && alertAudioRef.current) resumeAndPlayAlert(alertAudioRef.current);
          }
        } else {
          initializedStores.add(storeId);
        }
      },
      () => {
        ordersByStore.set(storeId, []);
        refreshOrders();
      },
    ));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [sellerStoreIdsKey, user]);

  useEffect(() => () => {
    const context = alertAudioRef.current;
    alertAudioRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  useEffect(() => {
    sellerOrdersRef.current = sellerOrders;
  }, [sellerOrders]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem("partx-seller-v1");
        if (saved) {
          const value = JSON.parse(saved);
          if (value.tickets) setTickets(value.tickets);
          if (value.ratings) setRatings(value.ratings);
          if (value.productOverrides) setProductOverrides(value.productOverrides);
        }
      } catch {}
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    const syncSellerState = (event: StorageEvent) => {
      if (event.key !== "partx-seller-v1" || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue) as { tickets?: SellerTicket[]; ratings?: StoreRating[]; productOverrides?: Record<string, { price: number; stock: number }> };
        if (next.tickets) setTickets(next.tickets);
        if (next.ratings) setRatings(next.ratings);
        if (next.productOverrides) setProductOverrides(next.productOverrides);
      } catch {}
    };
    window.addEventListener("storage", syncSellerState);
    return () => window.removeEventListener("storage", syncSellerState);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("partx-seller-v1", JSON.stringify({ tickets, ratings, productOverrides }));
  }, [tickets, ratings, productOverrides, hydrated]);

  const value = useMemo<SellerContextValue>(() => ({
    sellerOrders,
    paymentVerifications,
    paymentSettings,
    tickets,
    ratings,
    alertsEnabled,
    activeAlert,
    enableAlerts: () => {
      const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = alertAudioRef.current?.state === "closed" ? null : alertAudioRef.current;
      alertAudioRef.current = context ?? new AudioContextClass();
      setAlertsEnabled(true);
      alertsEnabledRef.current = true;
      resumeAndPlayAlert(alertAudioRef.current);
    },
    dismissAlert: () => setActiveAlert(null),
    savePaymentSettings: async (settings) => {
      const storeId = user?.storeIds?.[0];
      if (!user || user.activeRole !== "seller" || !storeId) throw new Error("A seller store is required before saving payment settings.");
      const normalized = { ...settings, upiId: settings.upiId.trim(), upiDisplayName: settings.upiDisplayName.trim() };
      if (normalized.upiEnabled && !isValidUpiId(normalized.upiId)) throw new Error("Enter a valid UPI ID such as store@bank.");
      if (normalized.upiEnabled && !normalized.upiDisplayName) throw new Error("Add the UPI account or display name.");
      if (!normalized.upiEnabled && !normalized.codEnabled) throw new Error("Enable at least one payment method.");
      await updateDoc(doc(firestore, "stores", storeId), { paymentSettings: normalized, updatedAt: serverTimestamp() });
      setPaymentSettings(normalized);
    },
    confirmPayment: async (orderId) => {
      if (!user || user.activeRole !== "seller") throw new Error("Sign in as a seller to verify payments.");
      await runTransaction(firestore, async (transaction) => {
        const orderRef = doc(firestore, "orders", orderId);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) throw new Error("The payment order could not be found.");
        const data = orderSnapshot.data();
        if (!user.storeIds?.includes(String(data.storeId ?? ""))) throw new Error("You cannot verify another seller's payment.");
        if (data.paymentStatus !== "PAYMENT_SUBMITTED") throw new Error("This payment is not awaiting verification.");
        const reference = String(data.upiTransactionReference ?? "");
        if (!reference) throw new Error("The customer has not submitted a UTR.");
        const referenceRef = doc(firestore, "paymentReferences", reference);
        const referenceSnapshot = await transaction.get(referenceRef);
        if (!referenceSnapshot.exists() || referenceSnapshot.data().orderId !== orderId) throw new Error("The submitted UTR record is missing or belongs to another order.");
        if (referenceSnapshot.data().status === "PAID" && referenceSnapshot.data().orderId !== orderId) throw new Error("This UTR has already been used for another paid order.");
        const items = Array.isArray(data.items) ? data.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
        const productRefs = items.map((item) => doc(firestore, "products", String(item.productId ?? "")));
        const productSnapshots = await Promise.all(productRefs.map((productRef) => transaction.get(productRef)));
        productSnapshots.forEach((productSnapshot, index) => {
          if (!productSnapshot.exists()) throw new Error("An ordered product is no longer available.");
          const productData = productSnapshot.data();
          const quantity = Number(items[index].quantity ?? 0);
          const currentStock = Number(productData.stock ?? 0);
          if (productData.storeId !== data.storeId) throw new Error("An ordered product no longer belongs to this store.");
          if (!Number.isInteger(quantity) || quantity <= 0 || currentStock < quantity) throw new Error(`Insufficient stock for ${String(items[index].productName ?? "an order item")}.`);
        });
        productSnapshots.forEach((productSnapshot, index) => {
          const quantity = Number(items[index].quantity);
          const nextStock = Number(productSnapshot.data()?.stock ?? 0) - quantity;
          transaction.update(productRefs[index], { stock: nextStock, status: nextStock > 0 ? "published" : "out-of-stock", lastOrderId: orderId, updatedAt: serverTimestamp() });
        });
        transaction.update(referenceRef, { status: "PAID", paymentVerifiedBy: user.id, paymentVerifiedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        transaction.update(orderRef, {
          paymentStatus: "PAID", orderStatus: "PLACED", status: "New", stage: "Confirmed",
          eta: data.fulfilment === "pickup" ? "Ready in 45 minutes" : "Tomorrow by 11 AM",
          paymentVerifiedBy: user.id, paymentVerifiedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      });
    },
    markPaymentNotFound: async (orderId) => {
      if (!user || user.activeRole !== "seller") throw new Error("Sign in as a seller to review payments.");
      await runTransaction(firestore, async (transaction) => {
        const orderRef = doc(firestore, "orders", orderId);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) throw new Error("The payment order could not be found.");
        const data = orderSnapshot.data();
        if (!user.storeIds?.includes(String(data.storeId ?? ""))) throw new Error("You cannot review another seller's payment.");
        if (data.paymentStatus !== "PAYMENT_SUBMITTED") throw new Error("This payment is not awaiting verification.");
        const reference = String(data.upiTransactionReference ?? "");
        if (reference) transaction.update(doc(firestore, "paymentReferences", reference), { status: "VERIFICATION_FAILED", updatedAt: serverTimestamp() });
        transaction.update(orderRef, { paymentStatus: "VERIFICATION_FAILED", orderStatus: "PAYMENT_VERIFICATION_PENDING", updatedAt: serverTimestamp() });
      });
    },
    updateOrderStatus: async (orderId, status) => {
      setSellerOrders((current) => current.map((order) => order.id === orderId ? { ...order, status } : order));
      const order = sellerOrdersRef.current.find((item) => item.id === orderId);
      if (order?.storeId) {
        await updateDoc(doc(firestore, "orders", orderId), {
          status,
          stage: customerStageForSellerStatus[status],
          ...(status === "Delivered" ? { eta: "Delivered just now" } : {}),
          updatedAt: serverTimestamp(),
        });
      }
      updateOrderStage(orderId, customerStageForSellerStatus[status]);
    },
    addTicket: (ticket) => {
      const created: SellerTicket = {
        ...ticket,
        id: createPartXId("TKT"),
        customer: ticket.customer ?? { name: "Akshay Singh", phone: "+91 98765 43210", email: "akshay@gmail.com" },
        createdAt: "Just now",
        priority: "Urgent",
        status: "Open",
        orderedProduct: sellerOrders.find((order) => order.id === ticket.orderId)?.productName ?? "Order item",
      };
      setTickets((current) => [created, ...current]);
      setActiveAlert({ kind: "ticket", ticket: created });
      if (alertsEnabled && alertAudioRef.current) resumeAndPlayAlert(alertAudioRef.current);
      return created;
    },
    resolveTicket: (ticketId, internalNote) => setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, status: "Resolved", internalNote, resolvedAt: "Just now" } : ticket)),
    addRating: (rating) => {
      const created: StoreRating = { ...rating, id: createPartXId("REV"), createdAt: "Just now", verified: true };
      setRatings((current) => [created, ...current]);
      return created;
    },
    updateProduct: (partNumber, price, stock) => setProductOverrides((current) => ({ ...current, [partNumber]: { price, stock } })),
    productOverrides,
    sellerProducts,
    addProduct: async (product, image) => {
      if (!user || user.activeRole !== "seller" || !user.storeIds?.[0]) throw new Error("A seller store is required before adding products.");
      const productRef = doc(collection(firestore, "products"));
      let uploadedImage: Awaited<ReturnType<typeof uploadProductImageToCloudinary>> | undefined;
      if (image) {
        validateProductImage(image);
        uploadedImage = await uploadProductImageToCloudinary(productRef.id, image);
      }
      try {
        await setDoc(productRef, {
          ...product,
          ...(uploadedImage ?? {}),
          sellerId: user.id,
          storeId: user.storeIds[0],
          status: product.stock > 0 ? "published" : "out-of-stock",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (reason) {
        if (uploadedImage) await deleteCloudinaryProductImage(uploadedImage.imagePublicId).catch(() => undefined);
        throw reason;
      }
    },
    addProducts: async (products) => {
      if (!user || user.activeRole !== "seller" || !user.storeIds?.[0]) throw new Error("A seller store is required before importing products.");
      if (!products.length) throw new Error("No valid products were found in this workbook.");
      const batch = writeBatch(firestore);
      for (const product of products) {
        batch.set(doc(collection(firestore, "products")), {
          ...product,
          sellerId: user.id,
          storeId: user.storeIds[0],
          status: product.stock > 0 ? "published" : "out-of-stock",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    },
    updateSellerProduct: async (productId, sellingPrice, stock) => {
      await updateDoc(doc(firestore, "products", productId), {
        sellingPrice,
        stock,
        status: stock > 0 ? "published" : "out-of-stock",
        updatedAt: serverTimestamp(),
      });
    },
    uploadProductImage: async (productId, image, onProgress) => {
      if (!user || user.activeRole !== "seller") throw new Error("Sign in as a seller to upload product images.");
      const product = sellerProducts.find((item) => item.id === productId);
      if (!product || product.sellerId !== user.id) throw new Error("You can only update products owned by your store.");
      validateProductImage(image);
      const uploadedImage = await uploadProductImageToCloudinary(productId, image, onProgress);
      try {
        await updateDoc(doc(firestore, "products", productId), { ...uploadedImage, updatedAt: serverTimestamp() });
      } catch (reason) {
        await deleteCloudinaryProductImage(uploadedImage.imagePublicId).catch(() => undefined);
        throw reason;
      }
      if (product.imagePublicId) await deleteCloudinaryProductImage(product.imagePublicId).catch(() => undefined);
    },
  }), [sellerOrders, paymentVerifications, paymentSettings, tickets, ratings, alertsEnabled, activeAlert, productOverrides, sellerProducts, updateOrderStage, user]);

  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>;
}

export function useSeller() {
  const context = useContext(SellerContext);
  if (!context) throw new Error("useSeller must be used inside SellerProvider");
  return context;
}

function validateProductImage(image: File) {
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(image.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (image.size > 5 * 1024 * 1024) throw new Error("Product images must be 5 MB or smaller.");
}

type FirestoreSellerOrder = SellerOrder & { createdAt?: unknown };

function toSellerOrder(id: string, data: Record<string, unknown>): FirestoreSellerOrder {
  const customer = data.customer && typeof data.customer === "object" ? data.customer as Record<string, unknown> : {};
  return {
    id,
    trackingId: String(data.trackingId ?? "PX-TRK-PENDING"),
    storeId: String(data.storeId ?? ""),
    storeName: String(data.storeName ?? "PartX seller"),
    customer: { name: String(customer.name ?? "Customer"), phone: String(customer.phone ?? ""), email: String(customer.email ?? "") },
    placedAt: String(data.placedAt ?? "Just now"),
    productName: String(data.productName ?? "Order item"),
    partNumber: String(data.partNumber ?? ""),
    quantity: Number(data.quantity ?? 1),
    fulfilment: data.fulfilment === "pickup" || data.fulfilment === "garage" ? data.fulfilment : "delivery",
    paymentStatus: isSellerPaymentStatus(data.paymentStatus) ? data.paymentStatus : "Paid",
    paymentMethod: data.paymentMethod === "upi" || data.paymentMethod === "cod" ? data.paymentMethod : undefined,
    paymentReference: typeof data.upiTransactionReference === "string" ? data.upiTransactionReference : typeof data.paymentReference === "string" ? data.paymentReference : undefined,
    paymentVerifiedAt: data.paymentVerifiedAt ? "Verified" : undefined,
    paymentVerifiedBy: typeof data.paymentVerifiedBy === "string" ? data.paymentVerifiedBy : undefined,
    paymentMode: data.paymentMode === "live" ? "live" : "test",
    orderStatus: data.orderStatus === "PAYMENT_PENDING" || data.orderStatus === "PAYMENT_VERIFICATION_PENDING" || data.orderStatus === "PLACED" || data.orderStatus === "PAYMENT_EXPIRED" || data.orderStatus === "PAYMENT_CANCELLED" ? data.orderStatus : undefined,
    sellerUpiIdSnapshot: typeof data.sellerUpiIdSnapshot === "string" ? data.sellerUpiIdSnapshot : undefined,
    sellerUpiNameSnapshot: typeof data.sellerUpiNameSnapshot === "string" ? data.sellerUpiNameSnapshot : undefined,
    paymentSubmittedAt: data.paymentSubmittedAt ? "Submitted" : undefined,
    expiresAt: firestoreDate(data.expiresAt),
    deadline: String(data.deadline ?? "Review order"),
    status: isSellerOrderStatus(data.status) ? data.status : "New",
    total: Number(data.total ?? 0),
    createdAt: data.createdAt,
  };
}

function firestoreTime(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

function isSellerOrderStatus(value: unknown): value is SellerOrderStatus {
  return value === "New" || value === "Accepted" || value === "Packing" || value === "Packed" || value === "Dispatched" || value === "Delivered";
}

function isSellerPaymentStatus(value: unknown): value is SellerPaymentStatus {
  return value === "Paid" || value === "Pending" || value === "COD" || value === "PENDING" || value === "PAYMENT_SUBMITTED" || value === "PAID" || value === "VERIFICATION_FAILED" || value === "PAYMENT_DUE" || value === "PAYMENT_EXPIRED" || value === "PAYMENT_CANCELLED";
}

function isFulfilmentOrder(order: SellerOrder) {
  return !order.orderStatus || order.orderStatus === "PLACED" || order.paymentStatus === "Paid" || order.paymentStatus === "COD";
}

function firestoreDate(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  return undefined;
}
