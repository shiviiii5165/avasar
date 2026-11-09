import "server-only";

import { parseCategoryDetails } from "@/server/domain/categories";
import { opportunityInput, type OpportunityInput } from "@/server/services/opportunities";

/** Opportunity form parsing and validation, shared by Admin and Employer Studio actions. Deliberately NOT a "use server" module, so it is never exposed as a callable server action. */
/**
 * Form → validated opportunity input, including the category's own fields (`d_*`). Shared with Employer
 * Studio. Errors are keyed by field name so they show next to the right input.
 */
export async function validateOpportunityForm(fd: FormData): Promise<{ ok: true; data: OpportunityInput } | { ok: false; errors: Record<string, string> }> {
  const parsed = opportunityInput.safeParse(opportunityForm(fd));
  const errors: Record<string, string> = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
  const det = parseCategoryDetails(String(fd.get("category") ?? ""), (k) => (fd.get(k) === null ? null : String(fd.get(k))));
  if (!det.ok) Object.assign(errors, det.errors);
  if (!parsed.success || !det.ok) return { ok: false, errors };
  return { ok: true, data: { ...parsed.data, details: det.details } };
}

function opportunityForm(fd: FormData) {
  const get = (k: string) => (fd.get(k) === null ? undefined : String(fd.get(k)));
  return {
    title: get("title"), category: get("category"), employmentType: get("employmentType") || undefined, organizationName: get("organizationName"),
    summary: get("summary") || undefined, description: get("description"), responsibilities: get("responsibilities") || undefined,
    workMode: get("workMode"), locations: get("locations") ?? "", compMin: get("compMin"), compMax: get("compMax"),
    compPeriod: get("compPeriod") || undefined, unpaid: fd.get("unpaid") === "on", durationWeeks: get("durationWeeks"),
    experienceMinYears: get("experienceMinYears"), deadline: get("deadline") || undefined, applicationMethod: get("applicationMethod"),
    externalUrl: get("externalUrl") || undefined, requiredSkills: get("requiredSkills") ?? "", preferredSkills: get("preferredSkills") ?? "",
    educationLevels: fd.getAll("educationLevels").map(String), graduationYearMin: get("graduationYearMin"), graduationYearMax: get("graduationYearMax"),
    requiresWorkAuthorizationIndia: fd.get("requiresWorkAuthorizationIndia") === "on", sourceUrl: get("sourceUrl") || undefined,
    stipendNote: get("stipendNote") || undefined, conversionPossible: fd.get("conversionPossible") === "on", deliverables: get("deliverables") || undefined,
  };
}
