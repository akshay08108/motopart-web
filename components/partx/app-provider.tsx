"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut, updateProfile } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import type { AppLocation, CartLine, CustomerUser, Garage, Order, OrderStage, PartnerStore, PaymentMethod, PaymentOrderStatus, Product, SellerPaymentStatus, SellerProduct, StorePaymentSettings, UserRole, Vehicle } from "@/lib/types";
import { activeOrder, getDemoCatalog, vehicles as initialVehicles } from "@/lib/demo-data";
import { firebaseAuth, firestore } from "@/lib/firebase";
import { demoGarages, demoLocation, demoStores } from "@/lib/marketplace-data";
import { createPartXId } from "@/lib/seller-data";
import { createPaymentOrderId, developmentPaymentSettings, isValidUtr, normalizeUtr, paymentExpiresAt } from "@/lib/upi-payments";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";

const AUTH_PROFILE_CACHE_KEY = "partx-firebase-profile-v1";

export type PartXOrder = Order & {
  items?: CartLine[];
  fulfilment?: "delivery" | "pickup" | "garage";
  trackingId?: string;
  storeId?: string;
  storeName?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: SellerPaymentStatus;
  orderStatus?: PaymentOrderStatus;
  paymentReference?: string;
  sellerUpiIdSnapshot?: string;
  sellerUpiNameSnapshot?: string;
  paymentSubmittedAt?: string;
  expiresAt?: Date;
};

export type CartSellerSelection = { storeId: string; storeName: string; price: number };
export type RegisterInput = { name: string; email: string; mobile: string; password: string; role: UserRole; storeName?: string };

const deliveredOrder: PartXOrder = { id: "PX-ORD-260820-J4F2", trackingId: "PX-TRK-8C4H2M", storeId: "autohub-mumbai", storeName: "AutoHub Mumbai", placedAt: "20 Aug, 4:18 PM", eta: "Delivered 21 Aug, 11:42 AM", stage: "Delivered", total: 1299, fulfilment: "delivery" };

type AppContextValue = {
  theme: "light" | "dark";
  toggleTheme: () => void;
  cart: CartLine[];
  cartCount: number;
  cartTotal: number;
  addToCart: (product: CartLine["product"], quantity?: number, seller?: CartSellerSelection) => void;
  setQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  vehicles: Vehicle[];
  activeVehicleId: string;
  setActiveVehicleId: (id: string) => void;
  addVehicle: (vehicle: Vehicle) => void;
  location: AppLocation;
  setLocation: (location: AppLocation) => void;
  garages: Garage[];
  addGarage: (garage: Garage) => void;
  stores: PartnerStore[];
  catalog: Product[];
  addStore: (store: PartnerStore) => void;
  submitStoreRating: (storeId: string, stars: number) => void;
  orders: PartXOrder[];
  placeOrder: (fulfilment: PartXOrder["fulfilment"], payment: PaymentMethod, attemptId?: string) => Promise<PartXOrder>;
  submitUpiReference: (orderId: string, reference: string) => Promise<void>;
  cancelPayment: (orderId: string) => Promise<void>;
  updateOrderStage: (orderId: string, stage: OrderStage) => void;
  liveOrderUpdate: { orderId: string; stage: OrderStage } | null;
  user: CustomerUser | null;
  authHydrated: boolean;
  signIn: (identifier: string, password: string, role: UserRole) => Promise<boolean>;
  register: (input: RegisterInput) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function PartXProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [activeVehicleId, setActiveVehicleId] = useState(initialVehicles[0].id);
  const [location, setLocation] = useState<AppLocation>(demoLocation);
  const [garages, setGarages] = useState<Garage[]>(demoGarages);
  const [stores, setStores] = useState<PartnerStore[]>(demoStores);
  const [firebaseStores, setFirebaseStores] = useState<FirebaseStoreRecord[]>([]);
  const [firebaseProducts, setFirebaseProducts] = useState<SellerProduct[]>([]);
  const [orders, setOrders] = useState<PartXOrder[]>([activeOrder, deliveredOrder]);
  const [liveOrderUpdate, setLiveOrderUpdate] = useState<{ orderId: string; stage: OrderStage } | null>(null);
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [firebaseHydrated, setFirebaseHydrated] = useState(false);
  const ordersRef = useRef<PartXOrder[]>([activeOrder, deliveredOrder]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    const stopStores = onSnapshot(collection(firestore, "stores"), (snapshot) => {
      setFirebaseStores(snapshot.docs.map((storeDoc) => ({ id: storeDoc.id, ...storeDoc.data() } as FirebaseStoreRecord)).filter((store) => store.status === "approved" || store.status === "pending"));
    }, () => setFirebaseStores([]));
    const stopProducts = onSnapshot(collection(firestore, "products"), (snapshot) => {
      setFirebaseProducts(snapshot.docs.map((productDoc) => ({ id: productDoc.id, ...productDoc.data() } as SellerProduct)).filter((product) => product.status === "published" || product.status === "out-of-stock"));
    }, () => setFirebaseProducts([]));
    return () => { stopStores(); stopProducts(); };
  }, []);

  const isCustomer = user?.roles.includes("customer") ?? false;

  useEffect(() => {
    if (!user?.id || !isCustomer) return;
    return onSnapshot(
      query(collection(firestore, "orders"), where("customerId", "==", user.id)),
      (snapshot) => {
        const liveOrders = snapshot.docs.map((orderDoc) => toCustomerOrder(orderDoc.id, orderDoc.data()));
        const liveIds = new Set(liveOrders.map((order) => order.id));
        const previous = ordersRef.current;
        const changed = liveOrders.find((nextOrder) => {
          const current = previous.find((order) => order.id === nextOrder.id);
          return current && current.stage !== nextOrder.stage;
        });
        const merged = [...liveOrders, ...previous.filter((order) => !liveIds.has(order.id))];
        ordersRef.current = merged;
        setOrders(merged);
        if (changed) setLiveOrderUpdate({ orderId: changed.id, stage: changed.stage });
      },
    );
  }, [isCustomer, user?.id]);

  useEffect(() => {
    if (!user?.id || !isCustomer) return;
    const pending = orders.filter((order) => order.paymentStatus === "PENDING" && order.expiresAt);
    if (!pending.length) return;
    const nextExpiry = Math.min(...pending.map((order) => order.expiresAt!.getTime()));
    const expire = async () => {
      const expired = pending.filter((order) => order.expiresAt!.getTime() <= Date.now());
      await Promise.all(expired.map((order) => updateDoc(doc(firestore, "orders", order.id), {
        paymentStatus: "PAYMENT_EXPIRED",
        orderStatus: "PAYMENT_EXPIRED",
        updatedAt: serverTimestamp(),
      }).catch(() => undefined)));
    };
    const delay = Math.max(0, Math.min(nextExpiry - Date.now(), 2_147_000_000));
    const timer = window.setTimeout(() => void expire(), delay);
    return () => window.clearTimeout(timer);
  }, [isCustomer, orders, user?.id]);

  useEffect(() => {
    const hydrate = () => {
      const savedTheme = readBrowserStorage("local", "partx-theme") ?? readBrowserStorage("local", "motopart-theme");
      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
      const savedCart = readBrowserStorage("local", "partx-cart-v1");
      const savedOrders = readBrowserStorage("local", "partx-orders-v1") ?? readBrowserStorage("local", "motopart-orders-v1");
      const savedProfile = readBrowserStorage("local", "partx-profile-v1");
      try { if (savedCart) setCart(JSON.parse(savedCart)); } catch {}
      try {
        if (savedOrders) {
          const restored: PartXOrder[] = JSON.parse(savedOrders);
          setOrders(restored.some((order) => order.id === deliveredOrder.id) ? restored : [...restored, deliveredOrder]);
        }
      } catch {}
      try {
        if (savedProfile) {
          const profile = JSON.parse(savedProfile);
          if (profile.vehicles) setVehicles(profile.vehicles);
          if (profile.activeVehicleId) setActiveVehicleId(profile.activeVehicleId);
          if (profile.location) setLocation(profile.location);
          if (profile.garages) setGarages(profile.garages);
          if (profile.stores) setStores(profile.stores.map((saved: PartnerStore) => {
            const seed = demoStores.find((store) => store.id === saved.id);
            if (!seed || (saved.ratingCount ?? 0) >= (seed.ratingCount ?? 0)) return saved;
            return { ...saved, rating: seed.rating, ratingCount: seed.ratingCount };
          }));
        }
      } catch {}
      removeBrowserStorage("local", "partx-auth-v1");
      setHydrated(true);
    };
    queueMicrotask(hydrate);
  }, []);

  useEffect(() => {
    let stopProfile = () => {};
    let profileTimeout: number | undefined;
    const clearProfileTimeout = () => {
      if (profileTimeout !== undefined) window.clearTimeout(profileTimeout);
      profileTimeout = undefined;
    };
    const stopAuth = onAuthStateChanged(firebaseAuth, (authUser) => {
      stopProfile();
      clearProfileTimeout();
      if (!authUser) {
        setUser(null);
        removeBrowserStorage("local", AUTH_PROFILE_CACHE_KEY);
        setFirebaseHydrated(true);
        return;
      }
      const cachedUser = readCachedFirebaseUser(authUser.uid, authUser.email ?? "");
      if (cachedUser) {
        setUser(cachedUser);
        setFirebaseHydrated(true);
      } else {
        setFirebaseHydrated(false);
        profileTimeout = window.setTimeout(() => setFirebaseHydrated(true), 10_000);
      }
      stopProfile = onSnapshot(doc(firestore, "users", authUser.uid), (snapshot) => {
        clearProfileTimeout();
        const profile = snapshot.exists() ? parseFirebaseUser(authUser.uid, authUser.email ?? "", snapshot.data()) : null;
        setUser(profile);
        if (profile) writeBrowserStorage("local", AUTH_PROFILE_CACHE_KEY, JSON.stringify(profile));
        else removeBrowserStorage("local", AUTH_PROFILE_CACHE_KEY);
        setFirebaseHydrated(true);
      }, () => {
        clearProfileTimeout();
        if (!cachedUser) setUser(null);
        setFirebaseHydrated(true);
      });
    }, () => {
      clearProfileTimeout();
      setUser(null);
      setFirebaseHydrated(true);
    });
    return () => { clearProfileTimeout(); stopProfile(); stopAuth(); };
  }, []);

  useEffect(() => {
    const syncCustomerOrders = (event: StorageEvent) => {
      if (event.key !== "partx-orders-v1" || !event.newValue) return;
      try {
        const incoming = JSON.parse(event.newValue) as PartXOrder[];
        const changed = incoming.find((nextOrder) => {
          const current = ordersRef.current.find((order) => order.id === nextOrder.id);
          return current && current.stage !== nextOrder.stage;
        });
        ordersRef.current = incoming;
        setOrders(incoming);
        if (changed) setLiveOrderUpdate({ orderId: changed.id, stage: changed.stage });
      } catch {}
    };
    window.addEventListener("storage", syncCustomerOrders);
    return () => window.removeEventListener("storage", syncCustomerOrders);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (hydrated) writeBrowserStorage("local", "partx-theme", theme);
  }, [theme, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeBrowserStorage("local", "partx-cart-v1", JSON.stringify(cart));
    writeBrowserStorage("local", "partx-orders-v1", JSON.stringify(orders));
    writeBrowserStorage("local", "partx-profile-v1", JSON.stringify({ vehicles, activeVehicleId, location, garages, stores }));
  }, [cart, orders, vehicles, activeVehicleId, location, garages, stores, hydrated]);

  const catalog = useMemo(() => {
    const storeNames = new Map(firebaseStores.map((store) => [store.id, store.name]));
    const combined = new Map(getDemoCatalog().map((product) => [product.id, product]));
    for (const product of firebaseProducts) combined.set(product.id, toCatalogProduct(product, storeNames.get(product.storeId) ?? "PartX seller", vehicles));
    return [...combined.values()];
  }, [firebaseProducts, firebaseStores, vehicles]);

  const marketplaceStores = useMemo(() => {
    const combined = new Map(stores.map((store) => [store.id, store]));
    for (const store of firebaseStores) {
      const existing = combined.get(store.id);
      const sellerProducts = firebaseProducts.filter((product) => product.storeId === store.id);
      combined.set(store.id, toPartnerStore(store, sellerProducts, existing));
    }
    return [...combined.values()];
  }, [firebaseProducts, firebaseStores, stores]);

  const catalogById = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog]);
  const storesById = useMemo(() => new Map(marketplaceStores.map((store) => [store.id, store])), [marketplaceStores]);
  const resolvedCart = useMemo(() => cart.map((line) => {
    const selectedStore = line.storeId ? storesById.get(line.storeId) : undefined;
    const selectedListing = selectedStore?.listings.find((listing) => listing.productId === line.product.id)
      ?? selectedStore?.listings.find((listing) => listing.partNumber === line.product.partNumber);
    const selectedProduct = selectedListing ? catalogById.get(selectedListing.productId) : undefined;
    if (!selectedStore || !selectedListing || !selectedProduct) return line;
    return {
      ...line,
      product: selectedProduct,
      storeName: selectedStore.name,
      unitPrice: selectedListing.price,
      quantity: Math.max(1, Math.min(line.quantity, selectedProduct.stock)),
    };
  }), [cart, catalogById, storesById]);

  const value = useMemo<AppContextValue>(() => ({
    theme,
    toggleTheme: () => setTheme((current) => current === "light" ? "dark" : "light"),
    cart: resolvedCart,
    cartCount: resolvedCart.reduce((sum, line) => sum + line.quantity, 0),
    cartTotal: resolvedCart.reduce((sum, line) => sum + (line.unitPrice ?? line.product.price) * line.quantity, 0),
    addToCart: (product, quantity = 1, seller) => setCart((current) => {
      const exactStore = marketplaceStores.find((store) => store.listings.some((listing) => listing.productId === product.id));
      const defaultStore = exactStore ?? marketplaceStores.find((store) => store.listings.some((listing) => listing.partNumber === product.partNumber));
      const defaultListing = defaultStore?.listings.find((listing) => listing.productId === product.id)
        ?? defaultStore?.listings.find((listing) => listing.partNumber === product.partNumber);
      const selection = seller ?? { storeId: defaultStore?.id ?? "autohub-mumbai", storeName: defaultStore?.name ?? product.seller, price: defaultListing?.price ?? product.price };
      const selectedStore = storesById.get(selection.storeId);
      const selectedListing = selectedStore?.listings.find((listing) => listing.productId === product.id)
        ?? selectedStore?.listings.find((listing) => listing.partNumber === product.partNumber);
      const selectedProduct = selectedListing ? catalogById.get(selectedListing.productId) ?? product : product;
      const found = current.find((line) => line.product.id === selectedProduct.id || line.product.partNumber === selectedProduct.partNumber);
      if (!found) return [...current, { product: selectedProduct, quantity, storeId: selection.storeId, storeName: selection.storeName, unitPrice: selection.price }];
      if (found.storeId !== selection.storeId) return current.map((line) => line.product.id === found.product.id ? { ...line, product: selectedProduct, storeId: selection.storeId, storeName: selection.storeName, unitPrice: selection.price } : line);
      return current.map((line) => line.product.id === found.product.id ? { ...line, product: selectedProduct, quantity: Math.min(line.quantity + quantity, selectedProduct.stock), unitPrice: selection.price } : line);
    }),
    setQuantity: (id, quantity) => {
      const partNumber = resolvedCart.find((line) => line.product.id === id)?.product.partNumber;
      setCart((current) => current.map((line) => line.product.id === id || (partNumber && line.product.partNumber === partNumber) ? { ...line, quantity: Math.max(1, Math.min(quantity, line.product.stock)) } : line));
    },
    removeFromCart: (id) => {
      const partNumber = resolvedCart.find((line) => line.product.id === id)?.product.partNumber;
      setCart((current) => current.filter((line) => line.product.id !== id && (!partNumber || line.product.partNumber !== partNumber)));
    },
    vehicles,
    activeVehicleId,
    setActiveVehicleId,
    addVehicle: (vehicle) => { setVehicles((current) => [...current, vehicle]); setActiveVehicleId(vehicle.id); },
    location,
    setLocation,
    garages,
    addGarage: (garage) => setGarages((current) => [...current, garage]),
    stores: marketplaceStores,
    catalog,
    addStore: (store) => setStores((current) => [...current, store]),
    submitStoreRating: (storeId, stars) => setStores((current) => current.map((store) => {
      if (store.id !== storeId) return store;
      const count = store.ratingCount ?? 0;
      return { ...store, rating: Number(((store.rating * count + stars) / (count + 1)).toFixed(1)), ratingCount: count + 1 };
    })),
    orders,
    placeOrder: async (fulfilment, payment, attemptId) => {
      if (!user) throw new Error("Sign in as a customer before placing an order.");
      if (!resolvedCart.length) throw new Error("Your cart is empty.");
      const orderStoreIds = new Set(resolvedCart.map((item) => item.storeId ?? "autohub-mumbai"));
      if (orderStoreIds.size > 1) throw new Error("Products from different stores must be checked out separately so each seller receives the correct order.");
      const storeId = resolvedCart[0]?.storeId ?? "autohub-mumbai";
      const selectedStore = storesById.get(storeId);
      if (!selectedStore) throw new Error("The selected store is no longer available.");
      const paymentSettings = selectedStore.paymentSettings;
      if (payment === "upi" && (!paymentSettings?.upiEnabled || !paymentSettings.upiId)) throw new Error(`${selectedStore.name} has not enabled UPI payments.`);
      if (payment === "cod" && !paymentSettings?.codEnabled) throw new Error(`${selectedStore.name} has not enabled cash on delivery.`);
      const subtotal = resolvedCart.reduce((sum, line) => sum + (line.unitPrice ?? line.product.price) * line.quantity, 0);
      const deliveryCharge = fulfilment === "delivery" && subtotal < 999 ? 99 : 0;
      const discount = 0;
      const totalAmount = subtotal + deliveryCharge - discount;
      const orderId = attemptId ?? createPaymentOrderId();
      const expiresAt = payment === "upi" ? paymentExpiresAt() : undefined;
      const order: PartXOrder = {
        id: orderId,
        trackingId: createPartXId("TRK"),
        storeId,
        storeName: selectedStore.name,
        placedAt: "Just now",
        eta: payment === "upi" ? "Waiting for payment verification" : fulfilment === "pickup" ? "Ready in 45 minutes" : "Tomorrow by 11 AM",
        stage: "Confirmed",
        total: totalAmount,
        items: resolvedCart,
        fulfilment,
        paymentMethod: payment,
        paymentStatus: payment === "upi" ? "PENDING" : "PAYMENT_DUE",
        orderStatus: payment === "upi" ? "PAYMENT_PENDING" : "PLACED",
        sellerUpiIdSnapshot: payment === "upi" ? paymentSettings?.upiId : undefined,
        sellerUpiNameSnapshot: payment === "upi" ? paymentSettings?.upiDisplayName : undefined,
        expiresAt,
      };
      const primaryItem = resolvedCart[0];
      const itemQuantities = Object.fromEntries(resolvedCart.map((item) => [item.product.id, item.quantity]));
      const orderData = {
        customerId: user.id,
        sellerId: selectedStore.sellerId ?? "",
        customer: { name: user.name, phone: user.mobile, email: user.email },
        trackingId: order.trackingId,
        storeId: order.storeId,
        storeName: order.storeName,
        placedAt: order.placedAt,
        eta: order.eta,
        stage: order.stage,
        status: "New",
        subtotal,
        deliveryCharge,
        discount,
        total: totalAmount,
        totalAmount,
        currency: "INR",
        fulfilment,
        paymentStatus: order.paymentStatus,
        paymentMethod: payment,
        paymentMode: "live",
        orderStatus: order.orderStatus,
        ...(payment === "upi" ? {
          sellerUpiIdSnapshot: paymentSettings!.upiId.trim(),
          sellerUpiNameSnapshot: paymentSettings!.upiDisplayName.trim(),
          expiresAt,
        } : {}),
        deadline: fulfilment === "pickup" ? "Ready within 45 minutes" : "Tomorrow, 11:00 AM",
        productName: resolvedCart.length > 1 ? `${primaryItem.product.name} + ${resolvedCart.length - 1} more` : primaryItem.product.name,
        partNumber: primaryItem.product.partNumber,
        quantity: resolvedCart.reduce((sum, item) => sum + item.quantity, 0),
        items: resolvedCart.map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          partNumber: item.product.partNumber,
          quantity: item.quantity,
          unitPrice: item.unitPrice ?? item.product.price,
          storeId: item.storeId ?? order.storeId,
          storeName: item.storeName ?? order.storeName,
        })),
        itemQuantities,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const savedData = await runTransaction(firestore, async (transaction) => {
        const orderRef = doc(firestore, "orders", order.id);
        if (attemptId) {
          const existingOrder = await transaction.get(orderRef);
          if (existingOrder.exists()) {
            const data = existingOrder.data();
            if (data.customerId !== user.id) throw new Error("This payment attempt belongs to another customer.");
            const existingExpiry = firestoreDate(data.expiresAt);
            if (data.paymentStatus !== "PENDING" || (existingExpiry && existingExpiry.getTime() <= Date.now())) {
              throw new Error("SAVED_PAYMENT_ATTEMPT_INACTIVE");
            }
            return data;
          }
        }
        const productRefs = resolvedCart.map((item) => doc(firestore, "products", item.product.id));
        const productSnapshots = await Promise.all(productRefs.map((productRef) => transaction.get(productRef)));
        productSnapshots.forEach((productSnapshot, index) => {
          if (!productSnapshot.exists()) return;
          const line = resolvedCart[index];
          const productData = productSnapshot.data();
          if (productData.storeId !== order.storeId) throw new Error(`${line.product.name} is no longer assigned to the selected store.`);
          const currentStock = Number(productData.stock ?? 0);
          if (currentStock < line.quantity) throw new Error(`Only ${currentStock} unit${currentStock === 1 ? " is" : "s are"} left for ${line.product.name}. Update your cart and try again.`);
          if (payment === "cod") {
            const nextStock = currentStock - line.quantity;
            transaction.update(productRefs[index], {
              stock: nextStock,
              status: nextStock > 0 ? "published" : "out-of-stock",
              lastOrderId: order.id,
              updatedAt: serverTimestamp(),
            });
          }
        });
        transaction.set(orderRef, orderData);
        return orderData;
      });
      const savedOrder = toCustomerOrder(order.id, savedData as Record<string, unknown>);
      setOrders((current) => [savedOrder, ...current.filter((item) => item.id !== savedOrder.id)]);
      if (payment === "cod") setCart([]);
      return savedOrder;
    },
    submitUpiReference: async (orderId, reference) => {
      if (!user) throw new Error("Sign in before submitting a payment reference.");
      if (!isValidUtr(reference)) throw new Error("Enter a valid 6–40 character UPI transaction reference or UTR.");
      const normalizedReference = normalizeUtr(reference);
      await runTransaction(firestore, async (transaction) => {
        const orderRef = doc(firestore, "orders", orderId);
        const referenceRef = doc(firestore, "paymentReferences", normalizedReference);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) throw new Error("The pending payment order could not be found.");
        const data = orderSnapshot.data();
        if (data.customerId !== user.id) throw new Error("This payment attempt belongs to another customer.");
        if (data.paymentMethod !== "upi") throw new Error("This order does not use UPI.");
        if (!new Set(["PENDING", "VERIFICATION_FAILED"]).has(String(data.paymentStatus))) throw new Error("This payment attempt cannot accept another reference.");
        const expiry = firestoreDate(data.expiresAt);
        if (expiry && expiry.getTime() <= Date.now()) throw new Error("This payment attempt has expired. Start a new payment from checkout.");
        transaction.set(referenceRef, {
          reference: normalizedReference,
          orderId,
          customerId: user.id,
          storeId: String(data.storeId ?? ""),
          status: "PAYMENT_SUBMITTED",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.update(orderRef, {
          upiTransactionReference: normalizedReference,
          paymentReference: normalizedReference,
          paymentStatus: "PAYMENT_SUBMITTED",
          orderStatus: "PAYMENT_VERIFICATION_PENDING",
          paymentSubmittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      setOrders((current) => current.map((item) => item.id === orderId ? { ...item, paymentReference: normalizedReference, paymentStatus: "PAYMENT_SUBMITTED", orderStatus: "PAYMENT_VERIFICATION_PENDING", paymentSubmittedAt: "Just now", eta: "Payment verification in progress" } : item));
      setCart([]);
    },
    cancelPayment: async (orderId) => {
      if (!user) throw new Error("Sign in before cancelling a payment attempt.");
      await updateDoc(doc(firestore, "orders", orderId), { paymentStatus: "PAYMENT_CANCELLED", orderStatus: "PAYMENT_CANCELLED", updatedAt: serverTimestamp() });
      setOrders((current) => current.map((item) => item.id === orderId ? { ...item, paymentStatus: "PAYMENT_CANCELLED", orderStatus: "PAYMENT_CANCELLED" } : item));
    },
    updateOrderStage: (orderId, stage) => {
      setOrders((current) => current.map((order) => order.id === orderId ? { ...order, stage, eta: stage === "Delivered" ? "Delivered just now" : order.eta } : order));
      setLiveOrderUpdate({ orderId, stage });
    },
    liveOrderUpdate,
    user,
    authHydrated: hydrated && firebaseHydrated,
    signIn: async (identifier, password, role) => {
      if (!identifier.trim() || password.length < 6) return false;
      try {
        const credential = await signInWithEmailAndPassword(firebaseAuth, identifier.trim(), password);
        const profileSnapshot = await getDoc(doc(firestore, "users", credential.user.uid));
        const profile = profileSnapshot.exists() ? parseFirebaseUser(credential.user.uid, credential.user.email ?? identifier, profileSnapshot.data()) : null;
        if (!profile?.roles.includes(role)) {
          await firebaseSignOut(firebaseAuth);
          return false;
        }
        await updateDoc(doc(firestore, "users", credential.user.uid), { activeRole: role, updatedAt: serverTimestamp() });
        const activeProfile = { ...profile, activeRole: role };
        setUser(activeProfile);
        writeBrowserStorage("local", AUTH_PROFILE_CACHE_KEY, JSON.stringify(activeProfile));
        return true;
      } catch {
        return false;
      }
    },
    register: async (input) => {
      if (!input.name.trim() || !input.email.trim() || !input.mobile.trim() || input.password.length < 6) return false;
      let credential;
      try {
        credential = await createUserWithEmailAndPassword(firebaseAuth, input.email.trim(), input.password);
        await updateProfile(credential.user, { displayName: input.name.trim() });
        const storeId = input.role === "seller" ? `store-${credential.user.uid}` : undefined;
        const profile: CustomerUser = {
          id: credential.user.uid,
          name: input.name.trim(),
          email: input.email.trim(),
          mobile: input.mobile.trim(),
          roles: [input.role],
          activeRole: input.role,
          ...(input.role === "seller" ? { sellerStatus: "approved" as const, storeIds: [storeId!], storeName: input.storeName?.trim() } : {}),
        };
        const profileData = {
          name: profile.name,
          email: profile.email,
          mobile: profile.mobile,
          roles: profile.roles,
          activeRole: profile.activeRole,
          ...(profile.sellerStatus ? { sellerStatus: profile.sellerStatus } : {}),
          ...(profile.storeIds ? { storeIds: profile.storeIds } : {}),
          ...(profile.storeName ? { storeName: profile.storeName } : {}),
        };
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, "users", credential.user.uid), { ...profileData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        if (storeId) batch.set(doc(firestore, "stores", storeId), { ownerId: credential.user.uid, name: input.storeName?.trim(), status: "approved", rating: 0, ratingCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        await batch.commit();
        setUser(profile);
        writeBrowserStorage("local", AUTH_PROFILE_CACHE_KEY, JSON.stringify(profile));
        return true;
      } catch {
        if (credential?.user) await deleteUser(credential.user).catch(() => undefined);
        return false;
      }
    },
    resetPassword: async (email) => {
      if (!email.includes("@")) return false;
      try { await sendPasswordResetEmail(firebaseAuth, email.trim()); return true; } catch { return false; }
    },
    signOut: async () => {
      setUser(null);
      removeBrowserStorage("local", AUTH_PROFILE_CACHE_KEY);
      await firebaseSignOut(firebaseAuth);
    },
  }), [theme, resolvedCart, vehicles, activeVehicleId, location, garages, marketplaceStores, catalog, catalogById, storesById, orders, liveOrderUpdate, user, hydrated, firebaseHydrated]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

type FirebaseStoreRecord = {
  id: string;
  ownerId: string;
  name: string;
  status: "pending" | "approved";
  rating?: number;
  ratingCount?: number;
  owner?: string;
  phone?: string;
  businessHours?: string;
  deliveryRadiusKm?: number;
  address?: string;
  paymentSettings?: StorePaymentSettings;
};

function toPartnerStore(store: FirebaseStoreRecord, products: SellerProduct[], existing?: PartnerStore): PartnerStore {
  return {
    id: store.id,
    sellerId: store.ownerId,
    name: store.name,
    owner: store.owner ?? existing?.owner ?? "PartX seller",
    phone: store.phone ?? existing?.phone ?? "Contact through PartX",
    businessHours: store.businessHours ?? existing?.businessHours ?? "Store hours not added",
    deliveryRadiusKm: store.deliveryRadiusKm ?? existing?.deliveryRadiusKm ?? 0,
    rating: store.rating ?? existing?.rating ?? 0,
    ratingCount: store.ratingCount ?? existing?.ratingCount ?? 0,
    distanceKm: existing?.distanceKm ?? 0,
    location: existing?.location ?? { id: `${store.id}-location`, label: "Store", address: store.address ?? "Location will be confirmed at checkout" },
    paymentSettings: store.paymentSettings ?? developmentPaymentSettings(store.name) ?? existing?.paymentSettings,
    listings: products.map((product) => ({
      id: product.id,
      productId: product.id,
      productName: product.name,
      partNumber: product.partNumber,
      category: product.category,
      price: product.sellingPrice,
      mrp: product.mrp,
      stock: product.stock,
    })),
  };
}

function toCatalogProduct(product: SellerProduct, storeName: string, vehicles: Vehicle[]): Product {
  const compatibility = product.compatibility.toLowerCase();
  return {
    id: product.id,
    brand: product.brand.toUpperCase(),
    name: product.name,
    partNumber: product.partNumber,
    oemNumber: product.partNumber,
    kind: product.condition === "New" ? "Premium aftermarket" : "Budget aftermarket",
    price: product.sellingPrice,
    listPrice: Math.max(product.mrp, product.sellingPrice),
    rating: 0,
    reviews: 0,
    category: product.category,
    imageIndex: stableImageIndex(product.id),
    imageUrl: product.imageUrl,
    barcode: product.barcode,
    compatibleVehicleIds: vehicles.filter((vehicle) => compatibility.includes(vehicle.make.toLowerCase()) && compatibility.includes(vehicle.model.toLowerCase())).map((vehicle) => vehicle.id),
    stock: product.stock,
    deliveryLabel: "Delivery estimate at checkout",
    warranty: product.warranty,
    seller: storeName,
  };
}

function stableImageIndex(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(hash) % 6;
}

function toCustomerOrder(id: string, data: Record<string, unknown>): PartXOrder {
  const items = Array.isArray(data.items) ? data.items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const line = item as Record<string, unknown>;
    const unitPrice = Number(line.unitPrice ?? 0);
    return [{
      product: {
        id: String(line.productId ?? ""), name: String(line.productName ?? "Order item"), partNumber: String(line.partNumber ?? ""),
        brand: "PARTX", oemNumber: String(line.partNumber ?? ""), kind: "OEM-equivalent" as const, price: unitPrice,
        listPrice: unitPrice, rating: 0, reviews: 0, category: "Other", imageIndex: 0, compatibleVehicleIds: [], stock: 0,
        deliveryLabel: "Order item", warranty: "See product details", seller: String(line.storeName ?? data.storeName ?? "PartX seller"),
      },
      quantity: Number(line.quantity ?? 1), storeId: String(line.storeId ?? data.storeId ?? ""),
      storeName: String(line.storeName ?? data.storeName ?? "PartX seller"), unitPrice,
    }];
  }) : undefined;
  return {
    id,
    trackingId: String(data.trackingId ?? "PX-TRK-PENDING"),
    storeId: String(data.storeId ?? ""),
    storeName: String(data.storeName ?? "PartX seller"),
    placedAt: String(data.placedAt ?? "Just now"),
    eta: String(data.eta ?? "Delivery estimate pending"),
    stage: isOrderStage(data.stage) ? data.stage : "Confirmed",
    total: Number(data.totalAmount ?? data.total ?? 0),
    items,
    fulfilment: data.fulfilment === "pickup" || data.fulfilment === "garage" ? data.fulfilment : "delivery",
    paymentMethod: data.paymentMethod === "upi" || data.paymentMethod === "cod" ? data.paymentMethod : undefined,
    paymentStatus: isSellerPaymentStatus(data.paymentStatus) ? data.paymentStatus : undefined,
    orderStatus: isPaymentOrderStatus(data.orderStatus) ? data.orderStatus : undefined,
    paymentReference: typeof data.upiTransactionReference === "string" ? data.upiTransactionReference : typeof data.paymentReference === "string" ? data.paymentReference : undefined,
    sellerUpiIdSnapshot: typeof data.sellerUpiIdSnapshot === "string" ? data.sellerUpiIdSnapshot : undefined,
    sellerUpiNameSnapshot: typeof data.sellerUpiNameSnapshot === "string" ? data.sellerUpiNameSnapshot : undefined,
    paymentSubmittedAt: data.paymentSubmittedAt ? "Submitted" : undefined,
    expiresAt: firestoreDate(data.expiresAt),
  };
}

function firestoreDate(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  return undefined;
}

function isSellerPaymentStatus(value: unknown): value is SellerPaymentStatus {
  return value === "Paid" || value === "Pending" || value === "COD" || value === "PENDING" || value === "PAYMENT_SUBMITTED" || value === "PAID" || value === "VERIFICATION_FAILED" || value === "PAYMENT_DUE" || value === "PAYMENT_EXPIRED" || value === "PAYMENT_CANCELLED";
}

function isPaymentOrderStatus(value: unknown): value is PaymentOrderStatus {
  return value === "PAYMENT_PENDING" || value === "PAYMENT_VERIFICATION_PENDING" || value === "PLACED" || value === "PAYMENT_EXPIRED" || value === "PAYMENT_CANCELLED";
}

function isOrderStage(value: unknown): value is OrderStage {
  return value === "Confirmed" || value === "Preparing" || value === "Picked up" || value === "On the way" || value === "Delivered";
}

function parseFirebaseUser(uid: string, authEmail: string, data: Record<string, unknown>): CustomerUser | null {
  const roles = Array.isArray(data.roles) ? data.roles.filter((role): role is UserRole => role === "customer" || role === "seller") : [];
  if (!roles.length) return null;
  const requestedRole = data.activeRole === "seller" ? "seller" : "customer";
  const activeRole = roles.includes(requestedRole) ? requestedRole : roles[0];
  return {
    id: uid,
    name: typeof data.name === "string" ? data.name : "PartX user",
    email: typeof data.email === "string" ? data.email : authEmail,
    mobile: typeof data.mobile === "string" ? data.mobile : "",
    roles,
    activeRole,
    sellerStatus: data.sellerStatus === "approved" ? "approved" : data.sellerStatus === "pending" ? "pending" : undefined,
    storeIds: Array.isArray(data.storeIds) ? data.storeIds.filter((id): id is string => typeof id === "string") : undefined,
    storeName: typeof data.storeName === "string" ? data.storeName : undefined,
  };
}

function readCachedFirebaseUser(uid: string, authEmail: string) {
  const cached = readBrowserStorage("local", AUTH_PROFILE_CACHE_KEY);
  if (!cached) return null;
  try {
    const data = JSON.parse(cached) as Record<string, unknown>;
    if (data.id !== uid) return null;
    return parseFirebaseUser(uid, authEmail, data);
  } catch {
    return null;
  }
}

export function usePartX() {
  const context = useContext(AppContext);
  if (!context) throw new Error("usePartX must be used inside PartXProvider");
  return context;
}
