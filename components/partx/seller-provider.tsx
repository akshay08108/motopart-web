"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SellerOrder, SellerOrderStatus, SellerTicket, StoreRating } from "@/lib/types";
import { createPartXId, sellerOrdersSeed, sellerTicketsSeed, storeRatingsSeed } from "@/lib/seller-data";

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
  addSellerOrder: (order: SellerOrder) => void;
  updateOrderStatus: (orderId: string, status: SellerOrderStatus) => void;
  addTicket: (ticket: NewTicket) => SellerTicket;
  resolveTicket: (ticketId: string, internalNote: string) => void;
  addRating: (rating: Omit<StoreRating, "id" | "createdAt" | "verified">) => StoreRating;
  updateProduct: (partNumber: string, price: number, stock: number) => void;
  productOverrides: Record<string, { price: number; stock: number }>;
};

const SellerContext = createContext<SellerContextValue | null>(null);

function playFiveSecondAlert() {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
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
  window.setTimeout(() => void context.close(), 5200);
}

export function SellerProvider({ children }: { children: React.ReactNode }) {
  const [sellerOrders, setSellerOrders] = useState<SellerOrder[]>(sellerOrdersSeed);
  const [tickets, setTickets] = useState<SellerTicket[]>(sellerTicketsSeed);
  const [ratings, setRatings] = useState<StoreRating[]>(storeRatingsSeed);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [activeAlert, setActiveAlert] = useState<SellerAlert | null>({ kind: "ticket", ticket: sellerTicketsSeed[0] });
  const [productOverrides, setProductOverrides] = useState<Record<string, { price: number; stock: number }>>({
    "BP-0986-424-384": { price: 1299, stock: 3 }, "LX-3541": { price: 649, stock: 12 }, MTRED60L: { price: 4999, stock: 2 }, "3397011417": { price: 799, stock: 4 }, "OC-523": { price: 259, stock: 0 },
  });
  const [hydrated, setHydrated] = useState(false);
  const alertsEnabledRef = useRef(false);
  const sellerOrdersRef = useRef(sellerOrdersSeed);

  useEffect(() => {
    alertsEnabledRef.current = alertsEnabled;
  }, [alertsEnabled]);

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
            if (alertsEnabledRef.current) playFiveSecondAlert();
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
      setAlertsEnabled(true);
      const recentOrder = sellerOrders.find((order) => order.status === "New" && order.placedAt === "Just now");
      const openTicket = tickets.find((ticket) => ticket.status === "Open");
      setActiveAlert(recentOrder ? { kind: "order", order: recentOrder } : openTicket ? { kind: "ticket", ticket: openTicket } : null);
      playFiveSecondAlert();
    },
    dismissAlert: () => setActiveAlert(null),
    addSellerOrder: (order) => {
      setSellerOrders((current) => current.some((item) => item.id === order.id) ? current : [order, ...current]);
      sellerOrdersRef.current = sellerOrdersRef.current.some((item) => item.id === order.id) ? sellerOrdersRef.current : [order, ...sellerOrdersRef.current];
      setActiveAlert({ kind: "order", order });
      if (alertsEnabled) playFiveSecondAlert();
    },
    updateOrderStatus: (orderId, status) => setSellerOrders((current) => current.map((order) => order.id === orderId ? { ...order, status } : order)),
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
      if (alertsEnabled) playFiveSecondAlert();
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
  }), [sellerOrders, tickets, ratings, alertsEnabled, activeAlert, productOverrides]);

  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>;
}

export function useSeller() {
  const context = useContext(SellerContext);
  if (!context) throw new Error("useSeller must be used inside SellerProvider");
  return context;
}
