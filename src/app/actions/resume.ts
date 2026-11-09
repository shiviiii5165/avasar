"use server";

import { redirect } from "next/navigation";

import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { resumeExtraction, type ResumeExtraction } from "@/server/ai/types";
import { applyResumeSuggestions, ResumeIntelError } from "@/server/services/resume-intel";

import type { ActionState } from "./candidate";

/** Applies the suggestions the student ticked. Each checkbox carries one item; the server re-checks them all. */
export async function applyResumeAction(resumeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireCandidate(`/app/profile/resume/${resumeId}`);
  const chosen: ResumeExtraction = { skills: [], education: [], experience: [], projects: [], certifications: [] };
  for (const raw of fd.getAll("item")) {
    try {
      const { section, value } = JSON.parse(String(raw)) as { section: keyof ResumeExtraction; value: never };
      if (section in chosen) (chosen[section] as unknown[]).push(value);
    } catch { /* ignore malformed */ }
  }
  const parsed = resumeExtraction.safeParse(chosen);
  if (!parsed.success) return { ok: false, message: "Some selected items couldn't be read. Please try again." };
  const total = Object.values(parsed.data).reduce((n, l) => n + l.length, 0);
  if (!total) return { ok: false, message: "Tick at least one item to add, or go back to your profile." };
  try {
    await applyResumeSuggestions(await getDb(), s.identity.id, s.profileId, resumeId, parsed.data);
  } catch (err) {
    if (err instanceof ResumeIntelError) return { ok: false, message: err.message };
    throw err;
  }
  redirect("/app/profile?resume_applied=1");
}
