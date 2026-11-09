/**
 * Production environment validation. Returns the NAMES of missing or unsafe settings (never values).
 * Run at startup (instrumentation) and shown in /api/health, so a misconfigured deploy is caught early.
 */
export interface EnvProblem { name: string; problem: string }

export function productionEnvProblems(env: Record<string, string | undefined> = process.env): EnvProblem[] {
  const p: EnvProblem[] = [];
  const need = (name: string, why: string) => { if (!env[name]) p.push({ name, problem: `missing (${why})` }); };
  need("DATABASE_URL", "managed PostgreSQL");
  need("AVSAR_PUBLIC_URL", "public origin for redirects and links");
  if (!env.AVSAR_SIGNING_SECRET || env.AVSAR_SIGNING_SECRET.length < 32) p.push({ name: "AVSAR_SIGNING_SECRET", problem: "missing or shorter than 32 characters" });
  for (const n of ["AVSAR_AIT_BASE_URL", "AVSAR_AIT_CLIENT_ID", "AVSAR_AIT_CLIENT_SECRET"]) need(n, "AI Tathastu sign-in");
  if (env.AVSAR_STORAGE_DRIVER !== "s3") p.push({ name: "AVSAR_STORAGE_DRIVER", problem: "must be s3 in production (private bucket)" });
  else { need("AVSAR_S3_BUCKET", "document storage"); need("AVSAR_S3_REGION", "document storage"); }
  need("AVSAR_EMAIL_WEBHOOK_URL", "email delivery");
  if (env.AVSAR_DEV_AUTH === "1") p.push({ name: "AVSAR_DEV_AUTH", problem: "must not be enabled in production (it is ignored, but remove it)" });
  if (env.AVSAR_PUBLIC_URL && !env.AVSAR_PUBLIC_URL.startsWith("https://")) p.push({ name: "AVSAR_PUBLIC_URL", problem: "must be https" });
  if (env.AVSAR_AI_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) p.push({ name: "ANTHROPIC_API_KEY", problem: "required when AVSAR_AI_PROVIDER=anthropic" });
  return p;
}
