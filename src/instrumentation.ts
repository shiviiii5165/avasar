/**
 * Next.js instrumentation: validates production settings at startup and reports unhandled request errors.
 * Critical problems (database, public URL, signing secret) stop the server from starting, so a misconfigured
 * deploy fails its health check instead of serving with unsafe fallbacks.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return; // build time, not a running server
  const { productionEnvProblems } = await import("./server/env-check");
  const { log } = await import("./server/log");
  const problems = productionEnvProblems();
  const critical = problems.filter((p) => p.critical);
  if (problems.length) log(critical.length ? "error" : "warn", "startup.env_invalid", { problems: problems.map((p) => `${p.name}: ${p.problem}`) });
  else log("info", "startup.env_ok");
  if (critical.length) throw new Error(`Refusing to start: missing or unsafe critical settings: ${critical.map((p) => p.name).join(", ")}`);
}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string; routeType: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./server/log");
  await reportError(err, { path: request.path, method: request.method, route: context.routePath, type: context.routeType });
}