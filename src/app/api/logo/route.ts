import { getDb } from "@/server/db/client";
import { logoFor } from "@/server/services/logos";

/**
 * GET /api/logo?name=<organization name> — the company's logo for tiles, served from Avsar's own origin.
 * 404 when there is none (the tile then shows the company's initials). Only published listings' companies resolve.
 */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (name.length < 2 || name.length > 120) return new Response(null, { status: 400 });
  const logo = await logoFor(await getDb(), name);
  if (!logo) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  return new Response(logo.bytes as BodyInit, {
    headers: {
      "Content-Type": logo.type,
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
