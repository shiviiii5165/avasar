/**
 * Compiles every page the specs visit before any test runs. On a cold `next dev`, the first request to a
 * route compiles it and can reload an already-open page mid-click; warming the routes removes that flake.
 */
const ROUTES = [
  "/sign-in", "/app", "/app/discover", "/app/applications", "/app/saved", "/app/profile", "/app/insights",
  "/app/notifications", "/app/settings", "/app/help", "/opportunities", "/api/auth/login", "/api/auth/tathastu/callback",
];

export default async function globalSetup() {
  const base = "http://localhost:3300";
  for (const route of ROUTES) {
    // Unauthenticated requests redirect; compiling the route is all that matters here.
    await fetch(base + route, { redirect: "manual" }).catch(() => undefined);
  }
}
