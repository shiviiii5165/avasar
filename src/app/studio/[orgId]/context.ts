import "server-only";

import { notFound } from "next/navigation";

import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { orgContext } from "@/server/services/employer";

/** Session + organization membership for a Studio page. Non-members get a 404 (organizations can't be probed). */
export async function studioPage(orgId: string, path = "") {
  const session = await requireUser(`/studio/${orgId}${path}`);
  const db = await getDb();
  const ctx = await orgContext(db, session.identity.id, orgId);
  if (!ctx) notFound();
  return { session, ctx, db };
}
