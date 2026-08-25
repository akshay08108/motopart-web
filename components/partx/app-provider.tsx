"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppLocation, CartLine, CustomerUser, Garage, Order, OrderStage, PartnerStore, UserRole, Vehicle } from "@/lib/types";
import { activeOrder, vehicles as initialVehicles } from "@/lib/demo-data";
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
  signOut: () => void;
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
  const [orders, setOrders] = useState<PartXOrder[]>([activeOrder, deliveredOrder]);
  const [liveOrderUpdate, setLiveOrderUpdate] = useState<{ orderId: string; stage: OrderStage } | null>(null);
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const ordersRef = useRef<PartXOrder[]>([activeOrder, deliveredOrder]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    const hydrate = () => {
      const savedTheme = localStorage.getItem("partx-theme") ?? localStorage.getItem("motopart-theme");
      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
      const savedCart = localStorage.getItem("partx-cart-v1");
      const savedOrders = localStorage.getItem("partx-orders-v1") ?? localStorage.getItem("motopart-orders-v1");
      const savedProfile = localStorage.getItem("partx-profile-v1");
      const savedAuth = localStorage.getItem("partx-auth-v1");
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
      try {
        if (savedAuth) {
          const savedUser = JSON.parse(savedAuth) as Partial<CustomerUser> & Pick<CustomerUser, "id" | "name" | "email" | "mobile">;
          setUser({ ...savedUser, roles: savedUser.roles ?? ["customer"], activeRole: savedUser.activeRole ?? "customer" });
        }
      } catch {}
      setHydrated(true);
    };
    queueMicrotask(hydrate);
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

  useEffect(() => {
    if (!hydrated) return;
    if (user) localStorage.setItem("partx-auth-v1", JSON.stringify(user));
    else localStorage.removeItem("partx-auth-v1");
  }, [user, hydrated]);

  const value = useMemo<AppContextValue>(() => ({
    theme,
    toggleTheme: () => setTheme((current) => current === "light" ? "dark" : "light"),
    cart,
    cartCount: cart.reduce((sum, line) => sum + line.quantity, 0),
    cartTotal: cart.reduce((sum, line) => sum + (line.unitPrice ?? line.product.price) * line.quantity, 0),
    addToCart: (product, quantity = 1, seller) => setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      const defaultStore = stores.find((store) => store.listings.some((listing) => listing.productId === product.id));
      const defaultListing = defaultStore?.listings.find((listing) => listing.productId === product.id);
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
    stores,
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
    authHydrated: hydrated,
    signIn: async (identifier, password, role) => {
      await new Promise((resolve) => setTimeout(resolve, 650));
      if (!identifier.trim() || password.trim().length < 4) return false;
      setUser(role === "seller"
        ? { id: "seller-rohan", name: "Rohan Mehta", email: identifier.includes("@") ? identifier : "seller@partx.demo", mobile: identifier.includes("@") ? "+91 98190 11022" : identifier, roles: ["seller"], activeRole: "seller", sellerStatus: "approved", storeIds: ["autohub-mumbai"], storeName: "AutoHub Mumbai" }
        : { id: "customer-akshay", name: "Akshay Singh", email: identifier.includes("@") ? identifier : "akshay@partx.demo", mobile: identifier.includes("@") ? "+91 98765 43210" : identifier, roles: ["customer"], activeRole: "customer" });
      return true;
    },
    register: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 650));
      if (!input.name.trim() || !input.email.trim() || !input.mobile.trim() || input.password.length < 4) return false;
      setUser(input.role === "seller"
        ? { id: `seller-${Date.now()}`, name: input.name, email: input.email, mobile: input.mobile, roles: ["seller"], activeRole: "seller", sellerStatus: "pending", storeIds: [], storeName: input.storeName }
        : { id: `customer-${Date.now()}`, name: input.name, email: input.email, mobile: input.mobile, roles: ["customer"], activeRole: "customer" });
      return true;
    },
    signOut: () => setUser(null),
  }), [theme, cart, vehicles, activeVehicleId, location, garages, stores, orders, liveOrderUpdate, user, hydrated]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function usePartX() {
  const context = useContext(AppContext);
  if (!context) throw new Error("usePartX must be used inside PartXProvider");
  return context;
}
