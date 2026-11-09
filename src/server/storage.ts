import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Private object storage. Files are never public: they are streamed through Avsar's authorized,
 * short-lived document route. Local disk in development; an S3-compatible bucket (AWS S3, Cloudflare R2,
 * MinIO, ...) in production, configured by the owner:
 *   AVSAR_STORAGE_DRIVER=s3, AVSAR_S3_BUCKET, AVSAR_S3_REGION, optional AVSAR_S3_ENDPOINT (S3-compatible),
 *   credentials via the standard AWS variables or the host's role (never in git).
 */
export interface Storage {
  readonly driver: "local" | "s3";
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  check(): Promise<void>;
}

const ROOT = path.join(process.cwd(), ".data/uploads");
const safeKey = (key: string) => {
  if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error("Invalid storage key");
  return key;
};

export const localStorage: Storage = {
  driver: "local",
  async put(key, bytes) {
    await mkdir(ROOT, { recursive: true });
    await writeFile(path.join(ROOT, safeKey(key)), bytes, { flag: "wx" });
  },
  get: (key) => readFile(path.join(ROOT, safeKey(key))),
  remove: (key) => rm(path.join(ROOT, safeKey(key)), { force: true }),
  check: async () => { await mkdir(ROOT, { recursive: true }); },
};

/** `client` is injectable for tests. Objects are written private with server-side encryption. */
export function s3Storage(cfg: { bucket: string; region: string; endpoint?: string; conditionalWrites?: boolean }, client = new S3Client({ region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: Boolean(cfg.endpoint) })): Storage {
  return {
    driver: "s3",
    async put(key, bytes, contentType) {
      await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: `documents/${safeKey(key)}`, Body: bytes, ContentType: contentType, ServerSideEncryption: cfg.endpoint ? undefined : "AES256",
        // Refuse to overwrite an existing object. Not every S3-compatible provider supports conditional PUT;
        // AVSAR_S3_CONDITIONAL_WRITES=0 turns it off (keys are random UUIDs, so overwrites are already improbable).
        ...(cfg.conditionalWrites === false ? {} : { IfNoneMatch: "*" }) }));
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: `documents/${safeKey(key)}` }));
      if (!res.Body) throw new Error("Object has no body");
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: `documents/${safeKey(key)}` }));
    },
    async check() {
      await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    },
  };
}

/** Storage isn't configured on this deployment: retrying won't help, so callers say so plainly. */
export class StorageUnavailableError extends Error {}

let cached: Storage | null = null;

/** The configured storage. Production refuses local disk, which isn't durable on most hosts. */
export function storage(): Storage {
  if (cached) return cached;
  if (process.env.AVSAR_STORAGE_DRIVER === "s3") {
    const bucket = process.env.AVSAR_S3_BUCKET, region = process.env.AVSAR_S3_REGION;
    if (!bucket || !region) throw new StorageUnavailableError("AVSAR_STORAGE_DRIVER=s3 needs AVSAR_S3_BUCKET and AVSAR_S3_REGION.");
    cached = s3Storage({ bucket, region, endpoint: process.env.AVSAR_S3_ENDPOINT || undefined, conditionalWrites: process.env.AVSAR_S3_CONDITIONAL_WRITES !== "0" });
  } else {
    if (process.env.NODE_ENV === "production" && process.env.AVSAR_ALLOW_LOCAL_STORAGE !== "1") throw new StorageUnavailableError("Production requires S3-compatible storage (AVSAR_STORAGE_DRIVER=s3).");
    cached = localStorage;
  }
  return cached;
}
