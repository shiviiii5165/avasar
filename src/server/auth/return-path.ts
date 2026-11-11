/**
 * The page a signed-out visitor was trying to open, so sign-in can return them there.
 *
 * Layouts can't see the request path, so the proxy (src/proxy.ts) records it in this request header.
 * The proxy always overwrites it: a value sent by the client never survives. Whoever reads it still
 * passes it through safeReturnTo (internal relative paths only), so it can never become an open redirect.
 * Edge-safe: no server-only imports (the proxy imports this file).
 */
export const RETURN_PATH_HEADER = "x-avsar-return-path";

export function requestPathOf(url: URL): string {
  return `${url.pathname}${url.search}`;
}
