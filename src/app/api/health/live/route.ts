export const dynamic = "force-dynamic";

/** GET /api/health/live — LIVENESS: the process is serving requests. Touches no database or provider. */
export function GET() {
  return Response.json({ status: "ok", time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}