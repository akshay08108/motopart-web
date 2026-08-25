import type { SellerOrder, SellerTicket, StoreRating } from "./types";

export const sellerOrdersSeed: SellerOrder[] = [
  { id: "PX-ORD-260825-A7K4", trackingId: "PX-TRK-9M2F7Q", customer: { name: "Akshay Singh", phone: "+91 98765 43210", email: "akshay@gmail.com" }, placedAt: "Today, 10:23 AM", productName: "Front Disc Brake Pad Set", partNumber: "BP-0986-424-384", quantity: 1, fulfilment: "delivery", paymentStatus: "Pending", deadline: "Today, 2:30 PM", status: "New", total: 1299 },
  { id: "PX-ORD-260825-H8M2", trackingId: "PX-TRK-7Q4K8N", customer: { name: "Rohit Verma", phone: "+91 91234 56789", email: "rohit@gmail.com" }, placedAt: "Today, 9:47 AM", productName: "High-flow Engine Air Filter", partNumber: "LX-3541", quantity: 1, fulfilment: "pickup", paymentStatus: "Paid", deadline: "Today, 3:00 PM", status: "Accepted", total: 649 },
  { id: "PX-ORD-260824-F3Q9", trackingId: "PX-TRK-3P8J2V", customer: { name: "Neha Patel", phone: "+91 99876 54321", email: "neha@gmail.com" }, placedAt: "Yesterday, 7:22 PM", productName: "Matrix 60Ah Car Battery", partNumber: "MTRED60L", quantity: 1, fulfilment: "garage", paymentStatus: "Paid", deadline: "Today, 10:00 AM", status: "Packing", total: 4999 },
  { id: "PX-ORD-260824-D1K8", trackingId: "PX-TRK-5R1T6C", customer: { name: "Vikram Joshi", phone: "+91 97654 32109", email: "vikram@gmail.com" }, placedAt: "Yesterday, 5:11 PM", productName: "Aerotwin Wiper Blade Set", partNumber: "3397011417", quantity: 2, fulfilment: "delivery", paymentStatus: "Paid", deadline: "Tomorrow, 11:30 AM", status: "Packed", total: 1598 },
  { id: "PX-ORD-260823-G6L5", trackingId: "PX-TRK-6W3D9B", customer: { name: "Ankit Mehta", phone: "+91 90012 34567", email: "ankit@gmail.com" }, placedAt: "24 Aug, 8:35 PM", productName: "Spin-on Engine Oil Filter", partNumber: "OC-523", quantity: 1, fulfilment: "pickup", paymentStatus: "Paid", deadline: "Today, 5:00 PM", status: "Dispatched", total: 259 },
];

export const sellerTicketsSeed: SellerTicket[] = [
  { id: "PX-TKT-10482", orderId: "PX-ORD-260824-F3Q9", customer: { name: "Akshay Singh", phone: "+91 98765 43210", email: "akshay@gmail.com" }, issue: "Wrong part received", message: "The brake pads delivered do not match my Hyundai Creta. The box part number is BP-0986-424-883.", createdAt: "3 min ago", priority: "Urgent", status: "Open", orderedProduct: "Front Disc Brake Pad Set · BP-0986-424-384", deliveredProduct: "Brake Pad Set · BP-0986-424-883" },
  { id: "PX-TKT-10481", orderId: "PX-ORD-260825-A7K4", customer: { name: "Rohit Verma", phone: "+91 91234 56789", email: "rohit@gmail.com" }, issue: "Item damaged", message: "The outer packaging is crushed and the filter frame is bent.", createdAt: "28 min ago", priority: "High", status: "Open", orderedProduct: "High-flow Engine Air Filter · LX-3541" },
];

export const storeRatingsSeed: StoreRating[] = [
  { id: "PX-REV-1008", orderId: "PX-ORD-260818-J4F2", storeId: "autohub-mumbai", customerName: "Priya Nair", stars: 5, comment: "Correct part and fast delivery. Fitment was perfect.", createdAt: "22 Aug 2026", verified: true },
  { id: "PX-REV-1007", orderId: "PX-ORD-260819-C2M8", storeId: "autohub-mumbai", customerName: "Rahul Desai", stars: 4, comment: "Well packed and exactly as described.", createdAt: "21 Aug 2026", verified: true },
];

export function createPartXId(kind: "ORD" | "TRK" | "TKT" | "REV") {
  const date = new Date();
  const stamp = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return kind === "TKT" || kind === "REV" ? `PX-${kind}-${Date.now().toString().slice(-5)}` : `PX-${kind}-${stamp}-${random}`;
}
