/**
 * Next.js instrumentation: validates production settings at startup and reports unhandled request errors.
 * Runs on the server only; reporting is best-effort and never changes the response.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { productionEnvProblems } = await import("./server/env-check");
  const { log } = await import("./server/log");
  const problems = productionEnvProblems();
  if (problems.length) log("error", "startup.env_invalid", { problems: problems.map((p) => `${p.name}: ${p.problem}`) });
  else log("info", "startup.env_ok");
}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string; routeType: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./server/log");
  await reportError(err, { path: request.path, method: request.method, route: context.routePath, type: context.routeType });
}