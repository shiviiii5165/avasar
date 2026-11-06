import type { ApplicationStatus } from "@/server/domain/workflows";

export const STATUS_TONE: Record<ApplicationStatus, "neutral" | "purple" | "success" | "danger" | "warning"> = {
  draft: "neutral", submitted: "purple", viewed: "purple", under_review: "purple", shortlisted: "warning", assessment: "warning",
  interview: "warning", offered: "success", selected: "success", rejected: "danger", withdrawn: "neutral", closed: "neutral",
};
