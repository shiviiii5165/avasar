import { getSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { can } from "@/server/domain/permissions";
import { apiError } from "@/server/http";
import { readDocumentForViewer, verifyDocumentSignature } from "@/server/services/documents";
import { employerMayViewDocument } from "@/server/services/employer";

/**
 * GET /api/documents/:id?exp=&sig= — streams a private document. Requires BOTH a valid session and a
 * short-lived signature issued to that same viewer, and re-checks ownership/permission. Never cached.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return apiError(401, "UNAUTHENTICATED", "Sign in to view this document");
  const url = new URL(request.url);
  if (!verifyDocumentSignature(id, session.identity.id, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? "")) {
    return apiError(403, "LINK_EXPIRED", "This link has expired. Open the document again from Avsar.");
  }
  const db = await getDb();
  const found = await readDocumentForViewer(db, id, { id: session.identity.id, canViewAny: can(session.roles, "document.view_any"), viaEmployer: () => employerMayViewDocument(db, session.identity.id, id) });
  if (!found) return apiError(404, "NOT_FOUND", "Document not found");
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "content-type": found.doc.mimeType,
      "content-disposition": `inline; filename="${found.doc.originalName.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
