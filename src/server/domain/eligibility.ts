/**
 * Eligibility engine: checks an opportunity's MANDATORY conditions only. It is separate from matching:
 * a high match score can never override a failed hard requirement, and missing candidate data is never
 * treated as a failure (it yields "insufficient_information" or "potentially_eligible").
 */
import { normalizeSkill } from "./skills";
import type { CandidateFacts, EducationLevel, OpportunityFacts } from "./types";

export type EligibilityStatus = "eligible" | "ineligible" | "potentially_eligible" | "insufficient_information" | "unavailable";
export type CheckOutcome = "pass" | "fail" | "unknown";

export interface EligibilityCheck {
  key: "deadline" | "education" | "graduation_year" | "experience" | "certifications" | "location" | "work_authorization";
  label: string;
  outcome: CheckOutcome;
  detail: string;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  checks: EligibilityCheck[];
  /** What the candidate can add to resolve unknown checks. */
  missingInformation: string[];
}

const LEVEL_RANK: Record<EducationLevel, number> = { secondary: 1, higher_secondary: 2, diploma: 3, bachelors: 4, masters: 5, doctorate: 6 };
const LEVEL_LABEL: Record<EducationLevel, string> = {
  secondary: "Class 10",
  higher_secondary: "Class 12",
  diploma: "Diploma",
  bachelors: "Bachelor's degree",
  masters: "Master's degree",
  doctorate: "Doctorate",
};

/** Years of experience: full-time/part-time/freelance count fully; internships at half weight. */
export function experienceYears(experiences: CandidateFacts["experiences"], now = new Date()): number | null {
  if (!experiences.length) return null;
  let months = 0;
  for (const e of experiences) {
    if (!e.startDate) continue;
    const start = new Date(e.startDate);
    const end = e.current || !e.endDate ? now : new Date(e.endDate);
    const m = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
    months += e.kind === "internship" ? m / 2 : m;
  }
  return Math.round((months / 12) * 10) / 10;
}

const lc = (s: string) => s.trim().toLowerCase();

export function evaluateEligibility(candidate: CandidateFacts | null, opp: OpportunityFacts, now = new Date()): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  const missing: string[] = [];

  // Deadline applies to everyone, signed in or not.
  if (opp.deadline) {
    const open = opp.deadline.getTime() > now.getTime();
    checks.push({ key: "deadline", label: "Applications open", outcome: open ? "pass" : "fail", detail: open ? `Closes ${opp.deadline.toDateString()}` : "The application deadline has passed" });
  }

  if (!candidate) {
    const deadlineFailed = checks.some((c) => c.outcome === "fail");
    return { status: deadlineFailed ? "ineligible" : "insufficient_information", checks, missingInformation: deadlineFailed ? [] : ["Sign in and add your profile to check eligibility"] };
  }

  const req = opp.eligibility;
  if (req?.educationLevels?.length) {
    const known = candidate.education.filter((e): e is typeof e & { level: EducationLevel } => e.level !== null);
    if (!known.length) {
      checks.push({ key: "education", label: "Education", outcome: "unknown", detail: `Requires ${req.educationLevels.map((l) => LEVEL_LABEL[l]).join(" or ")}` });
      missing.push(candidate.education.length ? "Confirm your education level" : "Add your education");
    } else {
      const minRequired = Math.min(...req.educationLevels.map((l) => LEVEL_RANK[l]));
      const best = Math.max(...known.map((e) => LEVEL_RANK[e.level]));
      // Currently pursuing counts: graduation year in the future still meets the level for student roles.
      const ok = best >= minRequired;
      checks.push({ key: "education", label: "Education", outcome: ok ? "pass" : "fail", detail: ok ? `${LEVEL_LABEL[(Object.keys(LEVEL_RANK) as EducationLevel[]).find((k) => LEVEL_RANK[k] === best)!]} meets the requirement` : `Requires at least ${LEVEL_LABEL[(Object.keys(LEVEL_RANK) as EducationLevel[]).find((k) => LEVEL_RANK[k] === minRequired)!]}` });
    }
  }

  if (req && (req.graduationYearMin !== null || req.graduationYearMax !== null)) {
    const years = candidate.education.map((e) => e.graduationYear).filter((y): y is number => y !== null);
    const range = `${req.graduationYearMin ?? "any"}–${req.graduationYearMax ?? "any"}`;
    if (!years.length) {
      checks.push({ key: "graduation_year", label: "Graduation year", outcome: "unknown", detail: `Open to graduates of ${range}` });
      missing.push("Add your graduation year");
    } else {
      const ok = years.some((y) => (req.graduationYearMin === null || y >= req.graduationYearMin) && (req.graduationYearMax === null || y <= req.graduationYearMax));
      checks.push({ key: "graduation_year", label: "Graduation year", outcome: ok ? "pass" : "fail", detail: ok ? `Your graduation year is within ${range}` : `Open to graduates of ${range} only` });
    }
  }

  const minExp = req?.minExperienceYears ?? null;
  if (minExp !== null && minExp > 0) {
    const yrs = experienceYears(candidate.experiences, now);
    if (yrs === null) {
      checks.push({ key: "experience", label: "Experience", outcome: "unknown", detail: `Requires ${minExp}+ years` });
      missing.push("Add your work experience");
    } else {
      const ok = yrs >= minExp;
      checks.push({ key: "experience", label: "Experience", outcome: ok ? "pass" : "fail", detail: ok ? `${yrs} years meets ${minExp}+` : `Requires ${minExp}+ years; your profile shows ${yrs}` });
    }
  }

  if (req?.requiredCertifications?.length) {
    const have = new Set(candidate.certifications.map(normalizeSkill));
    const lacking = req.requiredCertifications.filter((c) => !have.has(normalizeSkill(c)));
    if (!candidate.certifications.length) {
      checks.push({ key: "certifications", label: "Certifications", outcome: "unknown", detail: `Requires ${req.requiredCertifications.join(", ")}` });
      missing.push("Add your certifications");
    } else {
      checks.push({ key: "certifications", label: "Certifications", outcome: lacking.length ? "fail" : "pass", detail: lacking.length ? `Missing ${lacking.join(", ")}` : "Required certifications present" });
    }
  }

  if (req?.allowedLocations?.length && opp.workMode !== "remote") {
    const allowed = req.allowedLocations.map(lc);
    const where = [candidate.city, candidate.country, ...candidate.preferredLocations].filter(Boolean).map((s) => lc(s!));
    if (!where.length) {
      checks.push({ key: "location", label: "Location", outcome: "unknown", detail: `Open to ${req.allowedLocations.join(", ")}` });
      missing.push("Add your location");
    } else {
      const ok = where.some((w) => allowed.includes(w));
      checks.push({ key: "location", label: "Location", outcome: ok ? "pass" : "fail", detail: ok ? "Your location or preferred locations are eligible" : `Open to ${req.allowedLocations.join(", ")} only` });
    }
  }

  if (req?.requiresWorkAuthorizationIndia) {
    const auth = candidate.workAuthorizedIndia;
    checks.push({ key: "work_authorization", label: "Work authorization (India)", outcome: auth === null ? "unknown" : auth ? "pass" : "fail", detail: auth === null ? "Required for this role" : auth ? "You are authorized to work in India" : "Requires authorization to work in India" });
    if (auth === null) missing.push("Confirm your work authorization");
  }

  const failed = checks.some((c) => c.outcome === "fail");
  const unknown = checks.some((c) => c.outcome === "unknown");
  // The deadline is a gate, not evidence about the candidate: it doesn't make anyone "potentially" eligible.
  const passed = checks.filter((c) => c.outcome === "pass" && c.key !== "deadline").length;
  const status: EligibilityStatus = failed ? "ineligible" : unknown ? (passed > 0 ? "potentially_eligible" : "insufficient_information") : "eligible";
  return { status, checks, missingInformation: [...new Set(missing)] };
}

export const ELIGIBILITY_LABEL: Record<EligibilityStatus, string> = {
  eligible: "Eligible",
  ineligible: "Not eligible",
  potentially_eligible: "Potentially eligible",
  insufficient_information: "Add details to check",
  unavailable: "Eligibility unavailable",
};
