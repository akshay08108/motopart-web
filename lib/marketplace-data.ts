import type { AppLocation, Garage, Offer, PartnerStore } from "./types";

export const demoLocation: AppLocation = {
  id: "home-bandra",
  label: "Home",
  address: "24 Hill Road, Bandra West, Mumbai 400050",
  placeId: "demo-bandra-west",
  latitude: 19.0607,
  longitude: 72.8362,
};

export const demoGarages: Garage[] = [{
  id: "singh-auto-care",
  name: "Singh Auto Care",
  phone: "+91 98200 44551",
  services: "Installation, diagnostics and general service",
  distanceKm: 1.2,
  location: { ...demoLocation, id: "garage-bandra", label: "Garage", address: "Pali Naka, Bandra West, Mumbai 400050" },
}];

export const demoStores: PartnerStore[] = [
  {
    id: "autohub-mumbai", name: "AutoHub Mumbai", owner: "Rohan Mehta", phone: "+91 98190 11022", businessHours: "9:00 AM – 9:00 PM", deliveryRadiusKm: 8, rating: 4.6, distanceKm: 1.8,
    location: { id: "autohub-location", label: "Store", address: "Goregaon East, Mumbai", latitude: 19.1551, longitude: 72.8679 },
    listings: [{ id: "ah-brakes", productId: "bosch-brake-pads", productName: "Front Disc Brake Pad Set", partNumber: "BP-0986-424-384", category: "Brakes", price: 1299, mrp: 1620, stock: 15 }],
  },
  {
    id: "prime-spares", name: "Prime Spares", owner: "Neha Shah", phone: "+91 98201 33220", businessHours: "9:30 AM – 8:30 PM", deliveryRadiusKm: 10, rating: 4.7, distanceKm: 2.4,
    location: { id: "prime-location", label: "Store", address: "Andheri West, Mumbai", latitude: 19.1364, longitude: 72.8296 },
    listings: [{ id: "ps-brakes", productId: "bosch-brake-pads", productName: "Front Disc Brake Pad Set", partNumber: "BP-0986-424-384", category: "Brakes", price: 1249, mrp: 1560, stock: 20 }],
  },
  {
    id: "motorworks", name: "MotorWorks", owner: "Aditya Rao", phone: "+91 98920 22018", businessHours: "10:00 AM – 8:00 PM", deliveryRadiusKm: 12, rating: 4.5, distanceKm: 5.6,
    location: { id: "motorworks-location", label: "Store", address: "Chembur, Mumbai", latitude: 19.0522, longitude: 72.9005 },
    listings: [{ id: "mw-brakes", productId: "bosch-brake-pads", productName: "Front Disc Brake Pad Set", partNumber: "BP-0986-424-384", category: "Brakes", price: 1340, mrp: 1680, stock: 10 }],
  },
];

export const demoOffers: Offer[] = [{
  code: "WELCOME10",
  title: "10% off your first order",
  description: "New customers save up to ₹500 on their first MotoPart order.",
  discountPercent: 10,
  maxDiscount: 500,
  newUserOnly: true,
}];
