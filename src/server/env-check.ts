/**
 * Production environment validation. Returns the NAMES of missing or unsafe settings (never values).
 * `critical` problems stop the production server from starting (instrumentation.ts) and fail /api/health.
 */
export interface EnvProblem { name: string; problem: string; critical: boolean }

export function productionEnvProblems(env: Record<string, string | undefined> = process.env): EnvProblem[] {
  const p: EnvProblem[] = [];
  const add = (name: string, problem: string, critical = false) => p.push({ name, problem, critical });
  const need = (name: string, why: string, critical = false) => { if (!env[name]?.trim()) add(name, `missing (${why})`, critical); };

  need("DATABASE_URL", "managed PostgreSQL", true);
  if (!env.AVSAR_PUBLIC_URL?.trim()) add("AVSAR_PUBLIC_URL", "missing (public origin for redirects and links)", true);
  else if (!env.AVSAR_PUBLIC_URL.startsWith("https://")) add("AVSAR_PUBLIC_URL", "must be https", true);
  if (!env.AVSAR_SIGNING_SECRET || env.AVSAR_SIGNING_SECRET.length < 32) add("AVSAR_SIGNING_SECRET", "missing or shorter than 32 characters", true);

  for (const n of ["AVSAR_AIT_BASE_URL", "AVSAR_AIT_CLIENT_ID", "AVSAR_AIT_CLIENT_SECRET"]) need(n, "AI Tathastu sign-in");
  if (env.AVSAR_STORAGE_DRIVER !== "s3") add("AVSAR_STORAGE_DRIVER", "must be s3 in production (private bucket)");
  else { need("AVSAR_S3_BUCKET", "document storage"); need("AVSAR_S3_REGION", "document storage"); }
  need("AVSAR_EMAIL_WEBHOOK_URL", "email delivery");
  need("AVSAR_EMAIL_WEBHOOK_TOKEN", "email delivery");
  if (!env.AVSAR_EMAIL_FROM?.trim()) add("AVSAR_EMAIL_FROM", "missing (verified sender address)");
  else if (!/^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$|^.+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/.test(env.AVSAR_EMAIL_FROM.trim()) || env.AVSAR_EMAIL_FROM.includes(".invalid")) add("AVSAR_EMAIL_FROM", "not a valid sender address");
  need("AVSAR_HEALTH_TOKEN", "health details for monitoring");
  if (!env.AVSAR_CLIENT_IP_HEADER && !(Number(env.AVSAR_TRUSTED_PROXY_HOPS) > 0)) add("AVSAR_CLIENT_IP_HEADER", "or AVSAR_TRUSTED_PROXY_HOPS not set: per-IP limits use one shared bucket");
  if (env.AVSAR_DEV_AUTH === "1") add("AVSAR_DEV_AUTH", "must not be enabled in production (it is ignored, but remove it)");
  if (env.AVSAR_AI_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) add("ANTHROPIC_API_KEY", "required when AVSAR_AI_PROVIDER=anthropic");
  return p;
}

export const criticalProblems = (env: Record<string, string | undefined> = process.env) => productionEnvProblems(env).filter((p) => p.critical);