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

export type AppLocation = {
  id: string;
  label: string;
  address: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
};

export type Garage = {
  id: string;
  name: string;
  phone: string;
  services: string;
  distanceKm: number;
  location: AppLocation;
};

export type StoreListing = {
  id: string;
  productId: string;
  productName: string;
  partNumber: string;
  category: string;
  price: number;
  mrp: number;
  stock: number;
};

export type PartnerStore = {
  id: string;
  name: string;
  owner: string;
  phone: string;
  gstin?: string;
  businessHours: string;
  deliveryRadiusKm: number;
  rating: number;
  distanceKm: number;
  location: AppLocation;
  listings: StoreListing[];
};

export type FulfilmentMode = "delivery" | "pickup" | "garage";
export type PaymentMethod = "upi" | "card" | "cod";

export type Offer = {
  code: string;
  title: string;
  description: string;
  discountPercent: number;
  maxDiscount: number;
  newUserOnly: boolean;
};

export type PaymentResult = {
  id: string;
  status: "approved" | "declined";
  mode: "test";
  amount: number;
  message: string;
};
