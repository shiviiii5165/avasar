/**
 * Opportunity categories. Each category has its own structured fields (stored in `details`), its own
 * validation, and its own application questions, so a hackathon isn't forced into a job form.
 * Discovery shows only categories that currently have live listings.
 */
import { z } from "zod";

export type CategoryKey =
  | "job" | "internship" | "gig" | "scholarship" | "fellowship" | "hackathon" | "competition"
  | "research" | "startup_program" | "academic_project" | "professional_project";

export type FieldType = "text" | "longtext" | "number" | "date" | "checkbox" | "select";
export interface CategoryField { key: string; label: string; type: FieldType; required?: boolean; options?: [string, string][]; hint?: string }

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  plural: string;
  /** Pay/salary fields are relevant (jobs, internships, gigs, fellowships with stipends). */
  compensation: boolean;
  /** Employment type applies (jobs only). */
  employment: boolean;
  fields: CategoryField[];
  /** Questions every application to this category asks (merged with the listing's own questions). */
  questions: { key: string; label: string; required: boolean }[];
}

const FORMAT: [string, string][] = [["online", "Online"], ["offline", "In person"], ["hybrid", "Hybrid"]];

export const CATEGORIES: CategoryDef[] = [
  { key: "job", label: "Job", plural: "Jobs", compensation: true, employment: true, fields: [], questions: [] },
  {
    key: "internship", label: "Internship", plural: "Internships", compensation: true, employment: false,
    fields: [{ key: "stipendNote", label: "Stipend note", type: "text" }, { key: "conversionPossible", label: "Conversion to full-time possible", type: "checkbox" }, { key: "certificate", label: "Completion certificate", type: "checkbox" }],
    questions: [],
  },
  { key: "gig", label: "Freelance / gig", plural: "Freelance & Gigs", compensation: true, employment: false, fields: [{ key: "deliverables", label: "Deliverables", type: "longtext", required: true }], questions: [] },
  {
    key: "scholarship", label: "Scholarship", plural: "Scholarships", compensation: false, employment: false,
    fields: [
      { key: "awardAmount", label: "Award amount", type: "text", required: true, hint: "e.g. ₹50,000 per year" },
      { key: "academicRequirement", label: "Academic requirement", type: "text", required: true, hint: "e.g. 75% in Class 12 or CGPA 7.5+" },
      { key: "seats", label: "Number of awards", type: "number" },
      { key: "renewable", label: "Renewable each year", type: "checkbox" },
    ],
    questions: [
      { key: "academic_score", label: "Your latest marks or CGPA, as shown on your marksheet", required: true },
      { key: "scholarship_need", label: "How would this scholarship help you? (3–5 sentences)", required: true },
    ],
  },
  {
    key: "fellowship", label: "Fellowship", plural: "Fellowships", compensation: true, employment: false,
    fields: [
      { key: "focusArea", label: "Focus area", type: "text", required: true },
      { key: "duration", label: "Duration", type: "text", required: true, hint: "e.g. 12 months" },
      { key: "stipend", label: "Stipend", type: "text" },
      { key: "mentorship", label: "Mentorship and support", type: "longtext" },
    ],
    questions: [{ key: "statement_of_purpose", label: "Statement of purpose: why this fellowship, and what will you work on?", required: true }],
  },
  {
    key: "hackathon", label: "Hackathon", plural: "Hackathons", compensation: false, employment: false,
    fields: [
      { key: "eventStart", label: "Event starts", type: "date", required: true },
      { key: "eventEnd", label: "Event ends", type: "date" },
      { key: "format", label: "Format", type: "select", required: true, options: FORMAT },
      { key: "teamSizeMin", label: "Minimum team size", type: "number" },
      { key: "teamSizeMax", label: "Maximum team size", type: "number", required: true },
      { key: "themes", label: "Themes / tracks", type: "text" },
      { key: "prizes", label: "Prizes", type: "text" },
    ],
    questions: [
      { key: "team_name", label: "Team name (or \"Solo\")", required: true },
      { key: "team_members", label: "Team members' names and colleges", required: true },
    ],
  },
  {
    key: "competition", label: "Competition", plural: "Competitions", compensation: false, employment: false,
    fields: [
      { key: "eventDate", label: "Competition date", type: "date", required: true },
      { key: "format", label: "Format", type: "select", required: true, options: FORMAT },
      { key: "participation", label: "Participation", type: "select", required: true, options: [["individual", "Individual"], ["team", "Team"], ["either", "Individual or team"]] },
      { key: "prizes", label: "Prizes", type: "text" },
    ],
    questions: [{ key: "participation_details", label: "Are you entering alone or as a team? If a team, list members.", required: true }],
  },
  {
    key: "research", label: "Research", plural: "Research", compensation: true, employment: false,
    fields: [
      { key: "researchArea", label: "Research area", type: "text", required: true },
      { key: "requiredQualifications", label: "Required qualifications", type: "text", required: true },
      { key: "duration", label: "Duration", type: "text", required: true },
      { key: "supervisor", label: "Supervisor / lab", type: "text" },
    ],
    questions: [{ key: "research_interest", label: "Your research interest and any relevant coursework or projects", required: true }],
  },
  {
    key: "startup_program", label: "Startup program", plural: "Startup programs", compensation: false, employment: false,
    fields: [
      { key: "stage", label: "Startup stage accepted", type: "select", required: true, options: [["idea", "Idea"], ["mvp", "Prototype / MVP"], ["early_revenue", "Early revenue"], ["growth", "Growth"]] },
      { key: "benefits", label: "Programme benefits", type: "longtext", required: true },
      { key: "equity", label: "Equity or fees", type: "text", hint: "State clearly if the programme takes equity or charges fees." },
      { key: "duration", label: "Duration", type: "text" },
    ],
    questions: [{ key: "startup_pitch", label: "Describe your startup in two sentences and its current stage", required: true }],
  },
  {
    key: "academic_project", label: "Academic project", plural: "Academic projects", compensation: false, employment: false,
    fields: [
      { key: "deliverables", label: "Expected deliverables", type: "longtext", required: true },
      { key: "duration", label: "Duration", type: "text", required: true },
      { key: "contributionType", label: "Contribution", type: "select", required: true, options: [["individual", "Individual"], ["team", "Team"], ["open_source", "Open source"]] },
      { key: "credit", label: "Academic credit available", type: "checkbox" },
    ],
    questions: [{ key: "project_fit", label: "Relevant coursework or projects you've done", required: true }],
  },
  {
    key: "professional_project", label: "Professional project", plural: "Professional projects", compensation: true, employment: false,
    fields: [
      { key: "deliverables", label: "Expected deliverables", type: "longtext", required: true },
      { key: "duration", label: "Duration", type: "text", required: true },
      { key: "contributionType", label: "Contribution", type: "select", required: true, options: [["individual", "Individual"], ["team", "Team"], ["open_source", "Open source"]] },
    ],
    questions: [{ key: "project_fit", label: "Relevant work you've done (link it if you can)", required: true }],
  },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];
export const categoryDef = (key: string): CategoryDef | undefined => CATEGORIES.find((c) => c.key === key);

/** Validates a category's `details` from raw form values (`d_<key>`). Required fields are enforced. */
export function parseCategoryDetails(category: string, raw: (k: string) => string | null): { ok: true; details: Record<string, unknown> } | { ok: false; errors: Record<string, string> } {
  const def = categoryDef(category);
  if (!def) return { ok: false, errors: { category: "Choose a category" } };
  const details: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of def.fields) {
    const v = raw(`d_${f.key}`);
    const empty = v === null || v.trim() === "";
    if (f.type === "checkbox") { details[f.key] = v === "on"; continue; }
    if (empty) {
      if (f.required) errors[`d_${f.key}`] = `${f.label} is required for a ${def.label.toLowerCase()}`;
      else details[f.key] = null;
      continue;
    }
    const value = v!.trim();
    if (f.type === "number") {
      const n = z.coerce.number().int().min(0).max(1_000_000).safeParse(value);
      if (!n.success) errors[`d_${f.key}`] = `${f.label} must be a whole number`; else details[f.key] = n.data;
    } else if (f.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime())) errors[`d_${f.key}`] = `${f.label} must be a date`; else details[f.key] = value;
    } else if (f.type === "select") {
      if (!f.options!.some(([o]) => o === value)) errors[`d_${f.key}`] = `Choose a ${f.label.toLowerCase()}`; else details[f.key] = value;
    } else details[f.key] = value.slice(0, f.type === "longtext" ? 2000 : 300);
  }
  // Cross-field rules.
  if (category === "hackathon") {
    const min = details.teamSizeMin as number | null, max = details.teamSizeMax as number | null;
    if (min != null && max != null && min > max) errors.d_teamSizeMin = "Minimum team size can't exceed the maximum";
    if (details.eventEnd && details.eventStart && String(details.eventEnd) < String(details.eventStart)) errors.d_eventEnd = "The event can't end before it starts";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, details };
}

/** Category questions first, then the listing's own (deduplicated by key). */
export function mergeQuestions(category: string, own: { key: string; label: string; required: boolean }[]) {
  const base = categoryDef(category)?.questions ?? [];
  return [...base, ...own.filter((q) => !base.some((b) => b.key === q.key))];
}

/** Human-readable details for a listing page, in the category's field order. */
export function describeDetails(category: string, details: Record<string, unknown>): { label: string; value: string }[] {
  const def = categoryDef(category);
  if (!def) return [];
  return def.fields.flatMap((f) => {
    const v = details[f.key];
    if (v === null || v === undefined || v === "" || (f.type === "checkbox" && v !== true)) return [];
    const value = f.type === "checkbox" ? "Yes" : f.type === "select" ? (f.options!.find(([o]) => o === v)?.[1] ?? String(v)) : f.type === "date" ? new Date(String(v)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : String(v);
    return [{ label: f.label, value }];
  });
}

/** The one value worth showing on a card instead of pay, for categories where pay isn't the point. */
export function cardHighlight(category: string, details: Record<string, unknown>): string | null {
  const pick = (k: string) => (typeof details[k] === "string" && details[k] ? String(details[k]) : null);
  switch (category) {
    case "scholarship": return pick("awardAmount") && `Award: ${pick("awardAmount")}`;
    case "fellowship": return pick("stipend") && `Stipend: ${pick("stipend")}`;
    case "hackathon": case "competition": return pick("prizes") && `Prizes: ${pick("prizes")}`;
    case "research": case "academic_project": case "professional_project": case "startup_program": return pick("duration") && `Duration: ${pick("duration")}`;
    default: return null;
  }
}
