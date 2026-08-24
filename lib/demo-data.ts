import type { Order, Product, Vehicle } from "./types";

export const vehicles: Vehicle[] = [
  { id: "creta-2021", year: 2021, make: "Hyundai", model: "Creta", variant: "SX 1.5", fuel: "Petrol", transmission: "Manual", registration: "MH 02 EX 2105" },
  { id: "city-2020", year: 2020, make: "Honda", model: "City", variant: "VX 1.5", fuel: "Petrol", transmission: "CVT", registration: "MH 01 CT 8842" },
];

const products: Product[] = [
  { id: "bosch-brake-pads", brand: "BOSCH", name: "Front Disc Brake Pad Set", partNumber: "BP-0986-424-384", oemNumber: "58101-A0A00", kind: "Genuine/OEM", price: 1299, listPrice: 1620, rating: 4.6, reviews: 1245, category: "Brakes", imageIndex: 0, compatibleVehicleIds: ["creta-2021"], stock: 18, deliveryLabel: "Tomorrow by 11 AM", warranty: "12 months", seller: "AutoHub Mumbai" },
  { id: "mahle-air-filter", brand: "MAHLE", name: "High-flow Engine Air Filter", partNumber: "LX-3541", oemNumber: "28113-C9100", kind: "Premium aftermarket", price: 649, listPrice: 810, rating: 4.5, reviews: 892, category: "Filters", imageIndex: 1, compatibleVehicleIds: ["creta-2021", "city-2020"], stock: 31, deliveryLabel: "Tomorrow by 11 AM", warranty: "6 months", seller: "Prime Spares" },
  { id: "exide-battery", brand: "EXIDE", name: "Matrix 60Ah Car Battery", partNumber: "MTRED60L", oemNumber: "37110-C9000", kind: "OEM-equivalent", price: 4999, listPrice: 6250, rating: 4.7, reviews: 2341, category: "Batteries", imageIndex: 2, compatibleVehicleIds: ["creta-2021"], stock: 8, deliveryLabel: "Today in 90 min", warranty: "48 months", seller: "Battery Express" },
  { id: "ngk-spark-plug", brand: "NGK", name: "Laser Iridium Spark Plug", partNumber: "SILZKR7B11", oemNumber: "18846-11070", kind: "Premium aftermarket", price: 299, listPrice: 420, rating: 4.6, reviews: 1102, category: "Engine", imageIndex: 3, compatibleVehicleIds: ["creta-2021", "city-2020"], stock: 44, deliveryLabel: "Tomorrow by 11 AM", warranty: "6 months", seller: "Ignition House" },
  { id: "bosch-wipers", brand: "BOSCH", name: "Aerotwin Wiper Blade Set", partNumber: "3397011417", oemNumber: "98350-A0000", kind: "Premium aftermarket", price: 799, listPrice: 1100, rating: 4.5, reviews: 768, category: "Accessories", imageIndex: 4, compatibleVehicleIds: ["creta-2021"], stock: 23, deliveryLabel: "Tomorrow by 11 AM", warranty: "12 months", seller: "AutoHub Mumbai" },
  { id: "mahle-oil-filter", brand: "MAHLE", name: "Spin-on Engine Oil Filter", partNumber: "OC-523", oemNumber: "26300-35505", kind: "Genuine/OEM", price: 259, listPrice: 330, rating: 4.6, reviews: 1534, category: "Filters", imageIndex: 5, compatibleVehicleIds: ["creta-2021", "city-2020"], stock: 56, deliveryLabel: "Tomorrow by 11 AM", warranty: "6 months", seller: "Prime Spares" },
];

export const activeOrder: Order = {
  id: "MP78451236",
  placedAt: "Today, 10:24 AM",
  eta: "Today, 6:15 PM",
  stage: "On the way",
  total: 2137,
};

export function getDemoCatalog(query = "", category = "All") {
  const normalized = query.trim().toLowerCase();
  return products.filter((product) => {
    const matchesCategory = category === "All" || product.category === category;
    const haystack = `${product.name} ${product.brand} ${product.partNumber} ${product.oemNumber} ${product.category}`.toLowerCase();
    return matchesCategory && (!normalized || haystack.includes(normalized));
  });
}

export function getProduct(id: string) {
  return products.find((product) => product.id === id);
}
