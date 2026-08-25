"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SellerOrder, SellerOrderStatus, SellerTicket, StoreRating } from "@/lib/types";
import { createPartXId, sellerOrdersSeed, sellerTicketsSeed, storeRatingsSeed } from "@/lib/seller-data";

type NewTicket = Pick<SellerTicket, "orderId" | "issue" | "message"> & { customer?: SellerTicket["customer"] };

type SellerContextValue = {
  sellerOrders: SellerOrder[];
  tickets: SellerTicket[];
  ratings: StoreRating[];
  alertsEnabled: boolean;
  activeAlert: SellerTicket | null;
  enableAlerts: () => void;
  dismissAlert: () => void;
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
  const [activeAlert, setActiveAlert] = useState<SellerTicket | null>(sellerTicketsSeed[0]);
  const [productOverrides, setProductOverrides] = useState<Record<string, { price: number; stock: number }>>({
    "BP-0986-424-384": { price: 1299, stock: 3 }, "LX-3541": { price: 649, stock: 12 }, MTRED60L: { price: 4999, stock: 2 }, "3397011417": { price: 799, stock: 4 }, "OC-523": { price: 259, stock: 0 },
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem("partx-seller-v1");
        if (saved) {
          const value = JSON.parse(saved);
          if (value.sellerOrders) setSellerOrders(value.sellerOrders);
          if (value.tickets) {
            setTickets(value.tickets);
            setActiveAlert(value.tickets.find((ticket: SellerTicket) => ticket.status === "Open") ?? null);
          }
          if (value.ratings) setRatings(value.ratings);
          if (value.productOverrides) setProductOverrides(value.productOverrides);
        }
      } catch {}
      setHydrated(true);
    });
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
    enableAlerts: () => { setAlertsEnabled(true); setActiveAlert(tickets.find((ticket) => ticket.status === "Open") ?? null); playFiveSecondAlert(); },
    dismissAlert: () => setActiveAlert(null),
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
      setActiveAlert(created);
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
