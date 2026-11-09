import { afterEach, describe, expect, it, vi } from "vitest";

describe("storage() configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("production without a bucket raises StorageUnavailableError (callers tell the user it's unavailable, not to retry)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AVSAR_STORAGE_DRIVER", "");
    vi.stubEnv("AVSAR_ALLOW_LOCAL_STORAGE", "");
    const mod = await import("./storage");
    expect(() => mod.storage()).toThrow(mod.StorageUnavailableError);
  });

  it("s3 driver without bucket or region raises StorageUnavailableError", async () => {
    vi.stubEnv("AVSAR_STORAGE_DRIVER", "s3");
    vi.stubEnv("AVSAR_S3_BUCKET", "");
    vi.stubEnv("AVSAR_S3_REGION", "");
    const mod = await import("./storage");
    expect(() => mod.storage()).toThrow(mod.StorageUnavailableError);
  });

  it("development uses local disk", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AVSAR_STORAGE_DRIVER", "");
    const mod = await import("./storage");
    expect(mod.storage().driver).toBe("local");
  });
});
