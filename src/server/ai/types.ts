import { z } from "zod";

/**
 * What an extractor may return from a resume. Every item carries `evidence`: the exact line of the resume
 * it came from. Items whose evidence isn't found verbatim in the resume are discarded (see grounding.ts),
 * so neither the rules engine nor an AI model can add skills, roles or qualifications that aren't there.
 */
const evidence = z.string().min(2).max(400);
const opt = z.string().max(200).nullable().optional();

export const resumeExtraction = z.object({
  skills: z.array(z.object({ name: z.string().min(1).max(60), evidence })).max(60),
  education: z.array(z.object({ institution: z.string().min(2).max(200), degree: opt, field: opt, graduationYear: z.number().int().min(1950).max(2045).nullable().optional(), evidence })).max(10),
  experience: z.array(z.object({ title: z.string().min(2).max(140), organization: z.string().min(2).max(140), startDate: opt, endDate: opt, evidence })).max(20),
  projects: z.array(z.object({ title: z.string().min(2).max(140), description: z.string().max(600).nullable().optional(), evidence })).max(20),
  certifications: z.array(z.object({ name: z.string().min(2).max(160), issuer: opt, evidence })).max(20),
});
export type ResumeExtraction = z.infer<typeof resumeExtraction>;

export interface AiProvider {
  /** Stable identifier shown in AI Health and recorded in audit logs. */
  readonly name: "rules" | "anthropic";
  extractResume(text: string): Promise<ResumeExtraction>;
}

export const EMPTY_EXTRACTION: ResumeExtraction = { skills: [], education: [], experience: [], projects: [], certifications: [] };
