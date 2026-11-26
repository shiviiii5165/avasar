"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { setExcludedEvidenceTypes, setLearningEvidenceIncluded } from "@/server/services/career";

/** The student's own evidence preferences. profileId comes from the session, never from the form. */
export async function evidencePreferencesAction(fd: FormData) {
  const s = await requireCandidate("/app");
  const types = fd.getAll("exclude").map(String).slice(0, 20);
  await setExcludedEvidenceTypes(await getDb(), s.profileId, types, s.identity.id);
  revalidatePath("/app");
}

export async function toggleLearningEvidenceAction(evidenceId: string, include: boolean) {
  const s = await requireCandidate("/app");
  const id = z.string().uuid().safeParse(evidenceId);
  if (!id.success) return;
  await setLearningEvidenceIncluded(await getDb(), s.profileId, id.data, include);
  revalidatePath("/app");
}
