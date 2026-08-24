import type { Order, Product, Vehicle } from "@/lib/types";

type CheckoutInput = { address: string; delivery: string; payment: string; productIds: string[] };

export interface CommerceApi {
  getParts(params?: { query?: string; category?: string; vehicleId?: string }): Promise<Product[]>;
  getVehicles(): Promise<Vehicle[]>;
  getCompatibility(partId: string, vehicleId: string): Promise<{ compatible: boolean; message: string }>;
  checkout(input: CheckoutInput): Promise<Order>;
  getTracking(orderId: string): Promise<Order>;
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
};
