"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut, updateProfile } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import type { AppLocation, CartLine, CustomerUser, Garage, Order, OrderStage, PartnerStore, Product, SellerProduct, UserRole, Vehicle } from "@/lib/types";
import { activeOrder, getDemoCatalog, vehicles as initialVehicles } from "@/lib/demo-data";
import { firebaseAuth, firestore } from "@/lib/firebase";
import { demoGarages, demoLocation, demoStores } from "@/lib/marketplace-data";
import { createPartXId } from "@/lib/seller-data";

export type PartXOrder = Order & {
  items?: CartLine[];
  fulfilment?: "delivery" | "pickup" | "garage";
  trackingId?: string;
  storeId?: string;
  storeName?: string;
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
  placeOrder: (fulfilment: PartXOrder["fulfilment"], total: number) => PartXOrder;
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
      setFirebaseStores(snapshot.docs.map((storeDoc) => ({ id: storeDoc.id, ...storeDoc.data() } as FirebaseStoreRecord)).filter((store) => store.status === "approved"));
    }, () => setFirebaseStores([]));
    const stopProducts = onSnapshot(collection(firestore, "products"), (snapshot) => {
      setFirebaseProducts(snapshot.docs.map((productDoc) => ({ id: productDoc.id, ...productDoc.data() } as SellerProduct)).filter((product) => product.status === "published" || product.status === "out-of-stock"));
    }, () => setFirebaseProducts([]));
    return () => { stopStores(); stopProducts(); };
  }, []);

  useEffect(() => {
    const hydrate = () => {
      const savedTheme = localStorage.getItem("partx-theme") ?? localStorage.getItem("motopart-theme");
      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
      const savedCart = localStorage.getItem("partx-cart-v1");
      const savedOrders = localStorage.getItem("partx-orders-v1") ?? localStorage.getItem("motopart-orders-v1");
      const savedProfile = localStorage.getItem("partx-profile-v1");
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
      localStorage.removeItem("partx-auth-v1");
      setHydrated(true);
    };
    queueMicrotask(hydrate);
  }, []);

  useEffect(() => {
    let stopProfile = () => {};
    const stopAuth = onAuthStateChanged(firebaseAuth, (authUser) => {
      stopProfile();
      if (!authUser) {
        setUser(null);
        setFirebaseHydrated(true);
        return;
      }
      stopProfile = onSnapshot(doc(firestore, "users", authUser.uid), (snapshot) => {
        setUser(snapshot.exists() ? parseFirebaseUser(authUser.uid, authUser.email ?? "", snapshot.data()) : null);
        setFirebaseHydrated(true);
      }, () => {
        setUser(null);
        setFirebaseHydrated(true);
      });
    }, () => {
      setUser(null);
      setFirebaseHydrated(true);
    });
    return () => { stopProfile(); stopAuth(); };
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
    if (hydrated) localStorage.setItem("partx-theme", theme);
  }, [theme, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("partx-cart-v1", JSON.stringify(cart));
    localStorage.setItem("partx-orders-v1", JSON.stringify(orders));
    localStorage.setItem("partx-profile-v1", JSON.stringify({ vehicles, activeVehicleId, location, garages, stores }));
  }, [cart, orders, vehicles, activeVehicleId, location, garages, stores, hydrated]);

  const catalog = useMemo(() => {
    const storeNames = new Map(firebaseStores.map((store) => [store.id, store.name]));
    const combined = new Map(getDemoCatalog().map((product) => [product.id, product]));
    for (const product of firebaseProducts) combined.set(product.id, toCatalogProduct(product, storeNames.get(product.storeId) ?? "PartX verified seller", vehicles));
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

  const value = useMemo<AppContextValue>(() => ({
    theme,
    toggleTheme: () => setTheme((current) => current === "light" ? "dark" : "light"),
    cart,
    cartCount: cart.reduce((sum, line) => sum + line.quantity, 0),
    cartTotal: cart.reduce((sum, line) => sum + (line.unitPrice ?? line.product.price) * line.quantity, 0),
    addToCart: (product, quantity = 1, seller) => setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      const defaultStore = marketplaceStores.find((store) => store.listings.some((listing) => listing.productId === product.id || listing.partNumber === product.partNumber));
      const defaultListing = defaultStore?.listings.find((listing) => listing.productId === product.id || listing.partNumber === product.partNumber);
      const selection = seller ?? { storeId: defaultStore?.id ?? "autohub-mumbai", storeName: defaultStore?.name ?? product.seller, price: defaultListing?.price ?? product.price };
      if (!found) return [...current, { product, quantity, storeId: selection.storeId, storeName: selection.storeName, unitPrice: selection.price }];
      if (found.storeId !== selection.storeId) return current.map((line) => line.product.id === product.id ? { ...line, storeId: selection.storeId, storeName: selection.storeName, unitPrice: selection.price } : line);
      return current.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(line.quantity + quantity, product.stock), unitPrice: selection.price } : line);
    }),
    setQuantity: (id, quantity) => setCart((current) => current.map((line) => line.product.id === id ? { ...line, quantity: Math.max(1, Math.min(quantity, line.product.stock)) } : line)),
    removeFromCart: (id) => setCart((current) => current.filter((line) => line.product.id !== id)),
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
    placeOrder: (fulfilment, total) => {
      const order: PartXOrder = {
        id: createPartXId("ORD"),
        trackingId: createPartXId("TRK"),
        storeId: cart[0]?.storeId ?? "autohub-mumbai",
        storeName: cart[0]?.storeName ?? "AutoHub Mumbai",
        placedAt: "Just now",
        eta: fulfilment === "pickup" ? "Ready in 45 minutes" : "Tomorrow by 11 AM",
        stage: "Confirmed",
        total,
        items: cart,
        fulfilment,
      };
      setOrders((current) => [order, ...current]);
      setCart([]);
      return order;
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
        setUser({ ...profile, activeRole: role });
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
          ...(input.role === "seller" ? { sellerStatus: "pending" as const, storeIds: [storeId!], storeName: input.storeName?.trim() } : {}),
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
        if (storeId) batch.set(doc(firestore, "stores", storeId), { ownerId: credential.user.uid, name: input.storeName?.trim(), status: "pending", rating: 0, ratingCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        await batch.commit();
        setUser(profile);
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
    signOut: async () => { setUser(null); await firebaseSignOut(firebaseAuth); },
  }), [theme, cart, vehicles, activeVehicleId, location, garages, marketplaceStores, catalog, orders, liveOrderUpdate, user, hydrated, firebaseHydrated]);

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
};

function toPartnerStore(store: FirebaseStoreRecord, products: SellerProduct[], existing?: PartnerStore): PartnerStore {
  return {
    id: store.id,
    name: store.name,
    owner: store.owner ?? existing?.owner ?? "Verified PartX seller",
    phone: store.phone ?? existing?.phone ?? "Contact through PartX",
    businessHours: store.businessHours ?? existing?.businessHours ?? "Store hours not added",
    deliveryRadiusKm: store.deliveryRadiusKm ?? existing?.deliveryRadiusKm ?? 0,
    rating: store.rating ?? existing?.rating ?? 0,
    ratingCount: store.ratingCount ?? existing?.ratingCount ?? 0,
    distanceKm: existing?.distanceKm ?? 0,
    location: existing?.location ?? { id: `${store.id}-location`, label: "Store", address: store.address ?? "Location will be confirmed at checkout" },
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

export function usePartX() {
  const context = useContext(AppContext);
  if (!context) throw new Error("usePartX must be used inside PartXProvider");
  return context;
}
