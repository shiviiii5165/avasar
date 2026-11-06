/**
 * Contextual application questions: an opportunity's mandatory requirement whose eligibility check is
 * UNKNOWN (the profile doesn't say) becomes a question in that application, and nothing else does.
 * A passed check is never re-asked; a failed check is not turned into a question (the answer is known).
 */
import type { EligibilityResult } from "./eligibility";
import type { EducationLevel } from "./types";

export type RequirementKey = "graduation_year" | "education" | "work_authorization";

export interface RequirementAnswers {
  graduationYear?: number;
  educationLevel?: EducationLevel;
  workAuthorizedIndia?: boolean;
}

export const REQUIREMENT_LABEL: Record<RequirementKey, string> = {
  graduation_year: "Graduation year",
  education: "Highest education qualification",
  work_authorization: "Authorized to work in India",
};

export const EDUCATION_LEVELS: [EducationLevel, string][] = [
  ["secondary", "Class 10"], ["higher_secondary", "Class 12"], ["diploma", "Diploma"],
  ["bachelors", "Bachelor's degree"], ["masters", "Master's degree"], ["doctorate", "Doctorate"],
];

const ASKABLE = new Set<string>(["graduation_year", "education", "work_authorization"]);

export function requirementQuestions(result: EligibilityResult): RequirementKey[] {
  return result.checks.filter((c) => c.outcome === "unknown" && ASKABLE.has(c.key)).map((c) => c.key as RequirementKey);
}

/** Keys from `required` that the answers leave unanswered. */
export function unansweredRequirements(required: RequirementKey[], a: RequirementAnswers): RequirementKey[] {
  return required.filter((k) => (k === "graduation_year" ? a.graduationYear === undefined : k === "education" ? a.educationLevel === undefined : a.workAuthorizedIndia === undefined));
}

/** Human-readable record of what the candidate answered, for the application snapshot. */
export function describeAnswers(required: RequirementKey[], a: RequirementAnswers): { key: RequirementKey; question: string; answer: string }[] {
  return required.map((k) => ({
    key: k,
    question: REQUIREMENT_LABEL[k],
    answer: k === "graduation_year" ? String(a.graduationYear) : k === "education" ? (EDUCATION_LEVELS.find(([v]) => v === a.educationLevel)?.[1] ?? "") : a.workAuthorizedIndia ? "Yes" : "No",
  }));
}
