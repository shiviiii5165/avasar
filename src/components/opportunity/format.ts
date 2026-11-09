import { CATEGORIES } from "@/server/domain/categories";

/** Display helpers for opportunity data. Values that are missing are shown as missing, never invented. */
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatComp(o: { compMin: number | null; compMax: number | null; compPeriod: string | null; unpaid: boolean; compCurrency?: string }) {
  if (o.unpaid) return "Unpaid";
  if (o.compMin === null && o.compMax === null) return "Not disclosed";
  const lo = o.compMin ?? o.compMax!;
  const hi = o.compMax ?? o.compMin!;
  if (o.compPeriod === "year") {
    // Indian convention: lakhs per annum.
    const lpa = (n: number) => (n / 100000).toFixed(1).replace(/\.0$/, "");
    return lo === hi ? `₹${lpa(lo)} LPA` : `₹${lpa(lo)}–${lpa(hi)} LPA`;
  }
  const period = o.compPeriod === "month" ? " / month" : o.compPeriod === "project" ? " / project" : "";
  return lo === hi ? `₹${inr.format(lo)}${period}` : `₹${inr.format(lo)}–${inr.format(hi)}${period}`;
}

export const CATEGORY_LABEL: Record<string, string> = { ...Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])), entrepreneurship: "Entrepreneurship" };
export const WORK_MODE_LABEL: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
export const EMPLOYMENT_LABEL: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", temporary: "Temporary", contract: "Contract" };

export function deadlineLabel(deadline: Date | null, now = new Date()) {
  if (!deadline) return { text: "Rolling applications", urgent: false, closed: false };
  const days = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { text: "Closed", urgent: false, closed: true };
  if (days === 0) return { text: "Closes today", urgent: true, closed: false };
  if (days <= 7) return { text: `Closes in ${days} day${days === 1 ? "" : "s"}`, urgent: true, closed: false };
  return { text: `Apply by ${deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, urgent: false, closed: false };
}

export function placeLabel(o: { workMode: string; locations: string[] }) {
  if (o.workMode === "remote") return "Remote";
  return `${WORK_MODE_LABEL[o.workMode]} · ${o.locations.join(", ") || "Location not stated"}`;
}
