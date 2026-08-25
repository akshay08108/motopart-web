"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AppLocation, CartLine, Garage, Order, PartnerStore, Vehicle } from "@/lib/types";
import { activeOrder, vehicles as initialVehicles } from "@/lib/demo-data";
import { demoGarages, demoLocation, demoStores } from "@/lib/marketplace-data";

export type PartXOrder = Order & {
  items?: CartLine[];
  fulfilment?: "delivery" | "pickup" | "garage";
};

type AppContextValue = {
  theme: "light" | "dark";
  toggleTheme: () => void;
  cart: CartLine[];
  cartCount: number;
  cartTotal: number;
  addToCart: (product: CartLine["product"], quantity?: number) => void;
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
  orders: PartXOrder[];
  placeOrder: (fulfilment: PartXOrder["fulfilment"], total: number) => PartXOrder;
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
  const [orders, setOrders] = useState<PartXOrder[]>([activeOrder]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const hydrate = () => {
      const savedTheme = localStorage.getItem("partx-theme") ?? localStorage.getItem("motopart-theme");
      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
      const savedCart = localStorage.getItem("partx-cart-v1");
      const savedOrders = localStorage.getItem("partx-orders-v1") ?? localStorage.getItem("motopart-orders-v1");
      const savedProfile = localStorage.getItem("partx-profile-v1");
      try { if (savedCart) setCart(JSON.parse(savedCart)); } catch {}
      try { if (savedOrders) setOrders(JSON.parse(savedOrders)); } catch {}
      try {
        if (savedProfile) {
          const profile = JSON.parse(savedProfile);
          if (profile.vehicles) setVehicles(profile.vehicles);
          if (profile.activeVehicleId) setActiveVehicleId(profile.activeVehicleId);
          if (profile.location) setLocation(profile.location);
          if (profile.garages) setGarages(profile.garages);
          if (profile.stores) setStores(profile.stores);
        }
      } catch {}
      setHydrated(true);
    };
    queueMicrotask(hydrate);
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

  const value = useMemo<AppContextValue>(() => ({
    theme,
    toggleTheme: () => setTheme((current) => current === "light" ? "dark" : "light"),
    cart,
    cartCount: cart.reduce((sum, line) => sum + line.quantity, 0),
    cartTotal: cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    addToCart: (product, quantity = 1) => setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      return found
        ? current.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(line.quantity + quantity, product.stock) } : line)
        : [...current, { product, quantity }];
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
    orders,
    placeOrder: (fulfilment, total) => {
      const order: PartXOrder = {
        id: `PX${Date.now().toString().slice(-8)}`,
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
  }), [theme, cart, vehicles, activeVehicleId, location, garages, stores, orders]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function usePartX() {
  const context = useContext(AppContext);
  if (!context) throw new Error("usePartX must be used inside PartXProvider");
  return context;
}
