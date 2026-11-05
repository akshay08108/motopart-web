import type { RiderDelivery, RiderEarning } from "./rider";

export type EarningsPeriod = "today" | "week" | "month" | "all";
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function dateParts(timestamp: number) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}
export function inEarningsPeriod(timestamp: number | undefined, period: EarningsPeriod, now: number) {
  if (period === "all") return true;
  if (!timestamp || !Number.isFinite(timestamp) || timestamp > now) return false;
  const date = dateParts(timestamp); const current = dateParts(now);
  if (period === "month") return date.year === current.year && date.month === current.month;
  const days = (Date.UTC(current.year, current.month - 1, current.day) - Date.UTC(date.year, date.month - 1, date.day)) / 86_400_000;
  return days >= 0 && days < (period === "today" ? 1 : 7);
}
export function recordedEarning(job: RiderDelivery): RiderEarning | null {
  const earning = job.earnings;
  if (job.state !== "DELIVERED" || !earning || !Number.isSafeInteger(earning.amountPaise) || earning.amountPaise < 0 || earning.currency !== "INR" || !["store", "partx"].includes(earning.payer) || !["EARNED", "PAID"].includes(earning.status)) return null;
  return earning;
}
export function earningPaid(earning: RiderEarning) {
  return earning.status === "PAID" && typeof earning.paidAt === "number" && Number.isFinite(earning.paidAt) && earning.paidAt > 0;
}
export function earningsSummary(jobs: RiderDelivery[], period: EarningsPeriod, now: number) {
  const completed = jobs.filter((job) => job.state === "DELIVERED" && inEarningsPeriod(job.deliveredAt, period, now)).sort((a, b) => (b.deliveredAt ?? 0) - (a.deliveredAt ?? 0));
  let earnedPaise = 0; let paidPaise = 0; let unrecorded = 0; let codPaise = 0;
  for (const job of completed) {
    const earning = recordedEarning(job);
    if (earning) { earnedPaise += earning.amountPaise; if (earningPaid(earning)) paidPaise += earning.amountPaise; }
    else unrecorded++;
    if (job.codCollected && Number.isFinite(job.codAmount) && job.codAmount > 0) codPaise += Math.round(job.codAmount * 100);
  }
  return { completed, earnedPaise, paidPaise, pendingPaise: earnedPaise - paidPaise, unrecorded, codPaise };
}
export function riderMoney(amountPaise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: amountPaise % 100 ? 2 : 0 }).format(amountPaise / 100);
}
