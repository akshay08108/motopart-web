import type { Garage, Offer, Order, PartnerStore, PaymentResult, Product, SupportIssueType, SupportTicket, Vehicle } from "@/lib/types";

type CheckoutInput = { address: string; delivery: string; payment: string; productIds: string[]; discountCode?: string; storeId?: string };

export interface CommerceApi {
  getParts(params?: { query?: string; category?: string; vehicleId?: string }): Promise<Product[]>;
  getVehicles(): Promise<Vehicle[]>;
  getCompatibility(partId: string, vehicleId: string): Promise<{ compatible: boolean; message: string }>;
  checkout(input: CheckoutInput): Promise<Order>;
  getTracking(orderId: string): Promise<Order>;
  getStores(): Promise<PartnerStore[]>;
  addStore(store: Omit<PartnerStore, "id" | "rating" | "distanceKm">): Promise<PartnerStore>;
  getGarages(): Promise<Garage[]>;
  addGarage(garage: Omit<Garage, "id" | "distanceKm">): Promise<Garage>;
  getOffers(): Promise<Offer[]>;
  processTestPayment(input: { amount: number; method: string; cardNumber?: string }): Promise<PaymentResult>;
  createSupportTicket(input: { orderId: string; issueType: SupportIssueType; message: string }): Promise<SupportTicket>;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export const demoApi: CommerceApi = {
  getParts: ({ query = "", category = "All", vehicleId = "" } = {}) => {
    const params = new URLSearchParams({ query, category, vehicleId });
    return request<Product[]>(`/api/parts?${params}`);
  },
  getVehicles: () => request<Vehicle[]>("/api/vehicles"),
  getCompatibility: (partId, vehicleId) => request(`/api/compatibility?partId=${partId}&vehicleId=${vehicleId}`),
  checkout: (input) => request<Order>("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  getTracking: (orderId) => request<Order>(`/api/tracking?orderId=${orderId}`),
  getStores: () => request<PartnerStore[]>("/api/stores"),
  addStore: (store) => request<PartnerStore>("/api/stores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(store) }),
  getGarages: () => request<Garage[]>("/api/garages"),
  addGarage: (garage) => request<Garage>("/api/garages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(garage) }),
  getOffers: () => request<Offer[]>("/api/offers"),
  processTestPayment: (input) => request<PaymentResult>("/api/payments/mock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  createSupportTicket: (input) => request<SupportTicket>("/api/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
};
