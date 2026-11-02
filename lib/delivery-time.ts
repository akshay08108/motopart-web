/** Delivery labels must come from the saved server timestamp, never the viewing time. */
export function formatDeliveryTime(value: unknown): string | undefined {
  let date: Date | undefined;
  if (value instanceof Date) date = value;
  else if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") date = value.toDate();
  else if (typeof value === "string" || typeof value === "number") date = new Date(value);
  if (!date || !Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-IN", { dateStyle:"medium", timeStyle:"medium", timeZone:"Asia/Kolkata" }).format(date) + " IST";
}
