"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { NewSellerProduct, SellerOrder, SellerOrderStatus, SellerProduct, SellerTicket, StoreRating } from "@/lib/types";
import { createPartXId, sellerOrdersSeed, sellerTicketsSeed, storeRatingsSeed } from "@/lib/seller-data";
import { firebaseStorage, firestore } from "@/lib/firebase";
import { usePartX } from "./app-provider";

type NewTicket = Pick<SellerTicket, "orderId" | "issue" | "message"> & { customer?: SellerTicket["customer"] };
type SellerAlert = { kind: "order"; order: SellerOrder } | { kind: "ticket"; ticket: SellerTicket };

type SellerContextValue = {
  sellerOrders: SellerOrder[];
  tickets: SellerTicket[];
  ratings: StoreRating[];
  alertsEnabled: boolean;
  activeAlert: SellerAlert | null;
  enableAlerts: () => void;
  dismissAlert: () => void;
  updateOrderStatus: (orderId: string, status: SellerOrderStatus) => Promise<void>;
  addTicket: (ticket: NewTicket) => SellerTicket;
  resolveTicket: (ticketId: string, internalNote: string) => void;
  addRating: (rating: Omit<StoreRating, "id" | "createdAt" | "verified">) => StoreRating;
  updateProduct: (partNumber: string, price: number, stock: number) => void;
  productOverrides: Record<string, { price: number; stock: number }>;
  sellerProducts: SellerProduct[];
  addProduct: (product: NewSellerProduct, image?: File) => Promise<void>;
  addProducts: (products: NewSellerProduct[]) => Promise<void>;
  updateSellerProduct: (productId: string, sellingPrice: number, stock: number) => Promise<void>;
  uploadProductImage: (productId: string, image: File) => Promise<void>;
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
  const [sellerOrders, setSellerOrders] = useState<SellerOrder[]>(sellerOrdersSeed);
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
  const sellerOrdersRef = useRef(sellerOrdersSeed);
  const liveOrdersInitializedRef = useRef(false);
  const alertAudioRef = useRef<AudioContext | null>(null);
  const sellerStoreId = user?.activeRole === "seller" ? user.storeIds?.[0] : undefined;

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
    const storeId = sellerStoreId;
    if (!storeId) return;
    liveOrdersInitializedRef.current = false;
    return onSnapshot(
      query(collection(firestore, "orders"), where("storeId", "==", storeId)),
      (snapshot) => {
        const liveOrders = snapshot.docs.map((orderDoc) => toSellerOrder(orderDoc.id, orderDoc.data())).sort((a, b) => firestoreTime(b.createdAt) - firestoreTime(a.createdAt));
        const combined = mergeSellerOrders(liveOrders, sellerOrdersSeed);
        sellerOrdersRef.current = combined;
        setSellerOrders(combined);
        if (liveOrdersInitializedRef.current) {
          const incomingChange = snapshot.docChanges().find((change) => change.type === "added");
          if (incomingChange) {
            const incoming = toSellerOrder(incomingChange.doc.id, incomingChange.doc.data());
            setActiveAlert({ kind: "order", order: incoming });
            if (alertsEnabledRef.current && alertAudioRef.current) resumeAndPlayAlert(alertAudioRef.current);
          }
        } else {
          liveOrdersInitializedRef.current = true;
        }
      },
    );
  }, [sellerStoreId]);

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
          if (value.sellerOrders) {
            setSellerOrders(value.sellerOrders);
            const latestOrder = (value.sellerOrders as SellerOrder[]).find((order) => order.status === "New" && order.placedAt === "Just now");
            if (latestOrder) setActiveAlert({ kind: "order", order: latestOrder });
          }
          if (value.tickets) {
            setTickets(value.tickets);
            if (!value.sellerOrders?.some((order: SellerOrder) => order.status === "New" && order.placedAt === "Just now")) {
              const openTicket = value.tickets.find((ticket: SellerTicket) => ticket.status === "Open");
              if (openTicket) setActiveAlert({ kind: "ticket", ticket: openTicket });
            }
          }
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
        const next = JSON.parse(event.newValue) as { sellerOrders?: SellerOrder[]; tickets?: SellerTicket[]; ratings?: StoreRating[]; productOverrides?: Record<string, { price: number; stock: number }> };
        if (next.sellerOrders) {
          const currentIds = new Set(sellerOrdersRef.current.map((order) => order.id));
          const incoming = next.sellerOrders.find((order) => !currentIds.has(order.id));
          sellerOrdersRef.current = next.sellerOrders;
          setSellerOrders(next.sellerOrders);
          if (incoming) {
            setActiveAlert({ kind: "order", order: incoming });
            if (alertsEnabledRef.current && alertAudioRef.current) resumeAndPlayAlert(alertAudioRef.current);
          }
        }
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
    localStorage.setItem("partx-seller-v1", JSON.stringify({ sellerOrders, tickets, ratings, productOverrides }));
  }, [sellerOrders, tickets, ratings, productOverrides, hydrated]);

  const value = useMemo<SellerContextValue>(() => ({
    sellerOrders,
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
      if (!user || user.sellerStatus !== "approved" || !user.storeIds?.[0]) throw new Error("Only approved sellers can add products.");
      const productRef = doc(collection(firestore, "products"));
      const imageRef = image ? ref(firebaseStorage, productImagePath(user.id, productRef.id, image)) : null;
      let imageUrl: string | undefined;
      if (image && imageRef) {
        validateProductImage(image);
        await uploadBytes(imageRef, image, { contentType: image.type });
        imageUrl = await getDownloadURL(imageRef);
      }
      try {
        await setDoc(productRef, {
          ...product,
          ...(imageUrl ? { imageUrl } : {}),
          sellerId: user.id,
          storeId: user.storeIds[0],
          status: product.stock > 0 ? "published" : "out-of-stock",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (reason) {
        if (imageRef) await deleteObject(imageRef).catch(() => undefined);
        throw reason;
      }
    },
    addProducts: async (products) => {
      if (!user || user.sellerStatus !== "approved" || !user.storeIds?.[0]) throw new Error("Only approved sellers can import products.");
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
    uploadProductImage: async (productId, image) => {
      if (!user || user.sellerStatus !== "approved") throw new Error("Only approved sellers can upload product images.");
      const product = sellerProducts.find((item) => item.id === productId);
      if (!product || product.sellerId !== user.id) throw new Error("You can only update products owned by your store.");
      validateProductImage(image);
      const imageRef = ref(firebaseStorage, productImagePath(user.id, productId, image));
      await uploadBytes(imageRef, image, { contentType: image.type });
      await updateDoc(doc(firestore, "products", productId), { imageUrl: await getDownloadURL(imageRef), updatedAt: serverTimestamp() });
    },
  }), [sellerOrders, tickets, ratings, alertsEnabled, activeAlert, productOverrides, sellerProducts, updateOrderStage, user]);

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

function productImagePath(sellerId: string, productId: string, image: File) {
  const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
  return `products/${sellerId}/${productId}/primary-${Date.now()}.${extension}`;
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
    paymentStatus: data.paymentStatus === "COD" || data.paymentStatus === "Pending" ? data.paymentStatus : "Paid",
    deadline: String(data.deadline ?? "Review order"),
    status: isSellerOrderStatus(data.status) ? data.status : "New",
    total: Number(data.total ?? 0),
    createdAt: data.createdAt,
  };
}

function mergeSellerOrders(live: SellerOrder[], demo: SellerOrder[]) {
  const merged = new Map<string, SellerOrder>();
  for (const order of [...live, ...demo]) if (!merged.has(order.id)) merged.set(order.id, order);
  return [...merged.values()];
}

function firestoreTime(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

function isSellerOrderStatus(value: unknown): value is SellerOrderStatus {
  return value === "New" || value === "Accepted" || value === "Packing" || value === "Packed" || value === "Dispatched" || value === "Delivered";
}
