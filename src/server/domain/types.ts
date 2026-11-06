/** Plain inputs for the pure domain engines (no database or framework types). */

export type EducationLevel = "secondary" | "higher_secondary" | "diploma" | "bachelors" | "masters" | "doctorate";
export type WorkMode = "remote" | "hybrid" | "onsite";
export type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";

export interface CandidateFacts {
  education: { level: EducationLevel; graduationYear: number | null; field: string | null }[];
  /** Total months of relevant work (internships count at half weight; see experienceYears). */
  experiences: { kind: string; startDate: string | null; endDate: string | null; current: boolean }[];
  skills: { name: string; level: SkillLevel | null; evidenceCount: number }[];
  certifications: string[];
  city: string | null;
  country: string | null;
  workAuthorizedIndia: boolean | null;
  preferredLocations: string[];
  workModes: WorkMode[];
  preferredRoles: string[];
  preferredCategories: string[];
  expectedCompMin: number | null;
  compPeriod: string | null;
  availableFrom: string | null;
}

export interface OpportunityFacts {
  title: string;
  category: string;
  workMode: WorkMode;
  locations: string[];
  country: string;
  compMin: number | null;
  compMax: number | null;
  compPeriod: string | null;
  unpaid: boolean;
  deadline: Date | null;
  startDate: string | null;
  experienceMinYears: number | null;
  skills: { name: string; required: boolean }[];
  eligibility: {
    educationLevels: EducationLevel[] | null;
    graduationYearMin: number | null;
    graduationYearMax: number | null;
    minExperienceYears: number | null;
    requiredCertifications: string[] | null;
    allowedLocations: string[] | null;
    requiresWorkAuthorizationIndia: boolean;
  } | null;
}
