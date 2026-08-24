export type Vehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  variant: string;
  fuel: string;
  transmission: string;
  registration?: string;
};

export type ProductKind = "Genuine/OEM" | "OEM-equivalent" | "Premium aftermarket" | "Budget aftermarket";

export type Product = {
  id: string;
  brand: string;
  name: string;
  partNumber: string;
  oemNumber: string;
  kind: ProductKind;
  price: number;
  listPrice: number;
  rating: number;
  reviews: number;
  category: string;
  imageIndex: number;
  compatibleVehicleIds: string[];
  stock: number;
  deliveryLabel: string;
  warranty: string;
  seller: string;
};

export type CartLine = { product: Product; quantity: number };

export type OrderStage = "Confirmed" | "Preparing" | "Picked up" | "On the way" | "Delivered";

export type Order = {
  id: string;
  placedAt: string;
  eta: string;
  stage: OrderStage;
  total: number;
};
