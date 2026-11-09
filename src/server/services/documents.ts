import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { audit } from "../audit";
import { signingSecret } from "../config";
import type { Db } from "../db/client";
import { documentAccessLog, documents, resumes } from "../db/schema";
import { storage } from "../storage";

/** 4 MB: below Vercel's 4.5 MB request-body limit for functions, so uploads never fail at the platform edge. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const URL_TTL_SECONDS = 300;

/** Storage lives in ../storage (local disk in development, S3-compatible in production). */
export { storage } from "../storage";

/** Content-based type detection (the browser's type and the file name are not trusted). */
export function detectType(bytes: Buffer): { mime: string; ext: "pdf" | "docx" } | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (isZip && bytes.includes(Buffer.from("word/document.xml"))) return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
  return null;
}

export class UploadError extends Error {
  constructor(public readonly code: "EMPTY" | "TOO_LARGE" | "TYPE" | "LIMIT", message: string) {
    super(message);
  }
}

export async function uploadResume(db: Db, owner: { identityId: string; profileId: string }, file: { name: string; bytes: Buffer }, label?: string) {
  if (!file.bytes.length) throw new UploadError("EMPTY", "The file is empty.");
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new UploadError("TOO_LARGE", "Files must be 4 MB or smaller.");
  const type = detectType(file.bytes);
  if (!type) throw new UploadError("TYPE", "Upload a PDF or Word (.docx) file.");
  const existing = await db.select({ id: resumes.id, version: resumes.version }).from(resumes).innerJoin(documents, eq(resumes.documentId, documents.id)).where(and(eq(resumes.profileId, owner.profileId), isNull(documents.deletedAt)));
  if (existing.length >= 5) throw new UploadError("LIMIT", "You can keep up to 5 resumes. Delete one first.");

  const key = `${randomUUID()}.${type.ext}`;
  await storage().put(key, file.bytes, type.mime);
  try {
    return await db.transaction(async (tx) => {
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `resume.${type.ext}`;
      const [doc] = await tx.insert(documents).values({ ownerIdentityId: owner.identityId, kind: "resume", storageKey: key, originalName: safeName, mimeType: type.mime, sizeBytes: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex") }).returning();
      const version = Math.max(0, ...existing.map((e) => e.version)) + 1;
      const [resume] = await tx.insert(resumes).values({ profileId: owner.profileId, documentId: doc.id, label: (label?.trim() || safeName).slice(0, 80), version, isDefault: existing.length === 0 }).returning();
      await tx.insert(documentAccessLog).values({ documentId: doc.id, actorIdentityId: owner.identityId, action: "upload" });
      return resume;
    });
  } catch (err) {
    await storage().remove(key); // never leave orphaned bytes behind a failed write
    throw err;
  }
}

export async function setDefaultResume(db: Db, profileId: string, resumeId: string) {
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(resumes).where(and(eq(resumes.id, resumeId), eq(resumes.profileId, profileId)));
    if (!r) throw new Error("NOT_FOUND");
    await tx.update(resumes).set({ isDefault: false }).where(eq(resumes.profileId, profileId));
    await tx.update(resumes).set({ isDefault: true }).where(eq(resumes.id, resumeId));
  });
}

/**
 * Deletes a resume for the candidate. Bytes stay only if a submitted application references the document
 * (the application keeps its snapshot); otherwise they're removed from storage.
 */
export async function deleteResume(db: Db, owner: { identityId: string; profileId: string }, resumeId: string) {
  const [r] = await db.select({ resume: resumes, doc: documents }).from(resumes).innerJoin(documents, eq(resumes.documentId, documents.id)).where(and(eq(resumes.id, resumeId), eq(resumes.profileId, owner.profileId)));
  if (!r) throw new Error("NOT_FOUND");
  const { applications } = await import("../db/schema");
  const used = await db.select({ id: applications.id }).from(applications).where(eq(applications.resumeDocumentId, r.doc.id)).limit(1);
  await db.transaction(async (tx) => {
    await tx.delete(resumes).where(eq(resumes.id, resumeId));
    if (!used.length) await tx.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, r.doc.id));
    await tx.insert(documentAccessLog).values({ documentId: r.doc.id, actorIdentityId: owner.identityId, action: "delete" });
  });
  if (!used.length) await storage().remove(r.doc.storageKey);
  if (r.resume.isDefault) {
    const [next] = await db.select().from(resumes).where(eq(resumes.profileId, owner.profileId)).limit(1);
    if (next) await db.update(resumes).set({ isDefault: true }).where(eq(resumes.id, next.id));
  }
}

// ─── Short-lived signed URLs ──────────────────────────────────────────────
const sign = (documentId: string, viewerId: string, exp: number) => createHmac("sha256", signingSecret()).update(`${documentId}.${viewerId}.${exp}`).digest("base64url");

/** A link valid for 5 minutes and only for the viewer it was issued to. */
export function signedDocumentUrl(documentId: string, viewerId: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + URL_TTL_SECONDS;
  return `/api/documents/${documentId}?exp=${exp}&sig=${sign(documentId, viewerId, exp)}`;
}

export function verifyDocumentSignature(documentId: string, viewerId: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(sign(documentId, viewerId, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * `canViewAny`: Avsar staff with candidate.view. `viaEmployer`: decides whether an organization member may open
 * a resume that was submitted to their organization (checked lazily, only when needed).
 */
export async function readDocumentForViewer(db: Db, documentId: string, viewer: { id: string; canViewAny: boolean; viaEmployer?: () => Promise<boolean> }) {
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));
  if (!doc) return null;
  const own = doc.ownerIdentityId === viewer.id;
  const asEmployer = !own && !viewer.canViewAny && (await viewer.viaEmployer?.()) === true;
  if (!own && !viewer.canViewAny && !asEmployer) return null; // indistinguishable from missing
  await db.insert(documentAccessLog).values({ documentId, actorIdentityId: viewer.id, action: "view" });
  if (!own) await audit(db, { actorId: viewer.id, actorRole: asEmployer ? "employer" : "admin", action: "document.view", targetType: "document", targetId: documentId });
  return { doc, bytes: await storage().get(doc.storageKey) };
}
