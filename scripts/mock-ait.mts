/**
 * LOCAL MOCK of AI Tathastu's integration endpoints, for development and browser E2E only.
 * It is NOT AI Tathastu and NOT real SSO. It mirrors the contract verified from AI Tathastu's source
 * (src/lib/integrations/*), so Avsar's real verification code runs unchanged:
 *  - /integrations/authorize: client_id, exact redirect_uri (registered list, else {origin}/api/auth/tathastu/callback
 *    without query), state ≤ 500, PKCE S256 required, prompt=none → login_required/consent_required, Cancel → access_denied.
 *  - POST /api/integrations/sso/token: client secret, single-use 60-second code bound to redirect_uri + PKCE.
 *  - ES256 access token: iss https://www.aitathastu.com, aud=client, sub, iat, exp 15 min, jti, scope profile:read, email, name, sv.
 *  - /api/integrations/jwks, /api/integrations/v1/profile (401 invalid_token after disconnect; unshared sections are
 *    null and listed in privacy.masked).
 * Test controls (mock only): POST /__mock/disconnect, POST /__mock/reset, POST /__mock/share?sections=a,b
 *
 * Usage: npm run mock:ait  (port MOCK_AIT_PORT, default 3401). Refuses to run in production.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";

import { exportJWK, generateKeyPair, jwtVerify, SignJWT, createLocalJWKSet } from "jose";

if (process.env.NODE_ENV === "production") throw new Error("mock-ait must never run in production");

const PORT = Number(process.env.MOCK_AIT_PORT ?? 3401);
const SELF = `http://localhost:${PORT}`;
const ISSUER = "https://www.aitathastu.com"; // same issuer string as the real provider
const CLIENT_ID = process.env.MOCK_AIT_CLIENT_ID ?? "avsar";
const CLIENT_SECRET = process.env.MOCK_AIT_CLIENT_SECRET ?? "mock-only-secret";
const CLIENT_ORIGIN = (process.env.MOCK_AIT_CLIENT_ORIGIN ?? "http://localhost:3300").replace(/\/$/, "");
const REDIRECT_URIS = process.env.MOCK_AIT_REDIRECT_URIS?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const SUBJECT = "mock-ait-user-1";

const { publicKey, privateKey } = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(publicKey)), kid: "mock-1", alg: "ES256", use: "sig" };
const localJwks = createLocalJWKSet({ keys: [jwk] });

const codes = new Map<string, { challenge: string; redirectUri: string; exp: number }>();
let linked = false;
let shared = new Set(["education", "skills", "projects", "experience", "achievements"]);

const FULL = {
  education: [{ institution: "College of Engineering Pune", degree: "B.Tech", fieldOfStudy: "Computer Science", dates: "2022 - 2026", grade: "8.4 CGPA" }],
  skills: { items: ["React", "TypeScript", "HTML", "CSS", "Git", "JavaScript"].map((name) => ({ name, category: null, verified: false, verificationStatus: null, proficiency: null, level: null })) },
  projects: [{ key: "campus-events", title: "Campus events app", description: "A React app students use to find college events.", technologies: ["React", "TypeScript"], links: [] }],
  experience: [{ organization: "Pixel Labs", role: "Frontend Intern", dates: "Jun 2025 - Aug 2025", description: "Built accessible UI components." }],
  achievements: [{ type: "certification", title: "Responsive Web Design", issuer: "freeCodeCamp", date: "2024", url: null }],
} as const;

const profile = () => {
  const sections = Object.fromEntries(Object.entries(FULL).map(([k, v]) => [k, shared.has(k) ? v : null]));
  const scopes = Object.fromEntries(["skills", "projects", "eris", "experience", "education", "achievements", "activity"].map((s) => [s, shared.has(s)]));
  return {
    schema: "ProfessionalProjectionV1", version: 1, audience: CLIENT_ID, generatedAt: new Date().toISOString(),
    identity: { id: SUBJECT, email: "meera.mock@example.invalid", name: "Meera Iyer", headline: "Final-year Computer Science student", avatarUrl: null, careerRole: { id: "frontend", label: "Frontend Developer" }, location: { city: "Pune", country: "India" } },
    ...sections, activity: null, goals: null,
    privacy: { scopes, masked: [...Object.entries(sections).filter(([, v]) => v === null).map(([k]) => k), "activity", "goals"], hiddenProjects: 0, consentUpdatedAt: null },
  };
};

function allowedRedirect(uri: string) {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (REDIRECT_URIS?.length) return REDIRECT_URIS.includes(uri);
  if (u.search) return false;
  return u.origin === CLIENT_ORIGIN && u.pathname === "/api/auth/tathastu/callback";
}

const body = async (req: IncomingMessage) => { let s = ""; for await (const c of req) s += c; return new URLSearchParams(s); };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", SELF);
  const json = (status: number, v: unknown) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(v)); };
  const back = (redirectUri: string, params: Record<string, string | null>) => {
    const u = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
    res.writeHead(302, { location: u.toString() }); res.end();
  };

  if (url.pathname.startsWith("/__mock/") && req.method === "POST") {
    if (url.pathname === "/__mock/disconnect") linked = false;
    if (url.pathname === "/__mock/reset") { linked = false; shared = new Set(Object.keys(FULL)); }
    if (url.pathname === "/__mock/share") shared = new Set((url.searchParams.get("sections") ?? "").split(",").filter(Boolean));
    return json(200, { linked, shared: [...shared] });
  }

  if (url.pathname === "/integrations/authorize" || url.pathname === "/integrations/authorize/approve") {
    const q = url.searchParams;
    if (q.get("client_id") !== CLIENT_ID) return json(400, { error: "This app isn't registered with AI Tathastu." });
    const redirectUri = q.get("redirect_uri") ?? "";
    if (!allowedRedirect(redirectUri)) return json(400, { error: "The return address for this app isn't registered." });
    const state = q.get("state");
    if (state && state.length > 500) return back(redirectUri, { error: "invalid_request", error_description: "state is too long", state });
    const challenge = q.get("code_challenge");
    if (!challenge || q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return back(redirectUri, { error: "invalid_request", error_description: "code_challenge is required (S256)", state });
    const issue = () => {
      const code = randomBytes(32).toString("base64url");
      codes.set(code, { challenge, redirectUri, exp: Date.now() + 60_000 });
      linked = true;
      back(redirectUri, { code, state });
    };
    if (url.pathname.endsWith("/approve")) return issue();
    if (q.get("prompt") === "none") return linked ? issue() : back(redirectUri, { error: "consent_required", error_description: "Approve Avsar on AI Tathastu first.", state });
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    const cancel = new URL(redirectUri); cancel.searchParams.set("error", "access_denied"); cancel.searchParams.set("error_description", "The user cancelled."); if (state) cancel.searchParams.set("state", state);
    return res.end(`<!doctype html><meta charset="utf-8"><title>MOCK AI Tathastu</title>
<body style="font-family:system-ui;max-width:480px;margin:60px auto;padding:0 16px">
<p style="background:#fde68a;padding:8px 12px;border-radius:6px"><strong>MOCK provider for local testing.</strong> This is not AI Tathastu.</p>
<h1>Share your profile with Avsar?</h1><p>Signed in as Meera Iyer (mock). Avsar will receive: ${[...shared].join(", ") || "only your name"}.</p>
<a id="approve" href="/integrations/authorize/approve?${q.toString()}" style="display:inline-block;background:#3b2a7a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Allow</a>
<a id="cancel" href="${cancel.toString().replace(/"/g, "&quot;")}">Cancel</a></body>`);
  }

  if (url.pathname === "/api/integrations/sso/token" && req.method === "POST") {
    const f = await body(req);
    if (f.get("client_id") !== CLIENT_ID || f.get("client_secret") !== CLIENT_SECRET) return json(401, { error: "invalid_client", error_description: "Unknown client or wrong client secret." });
    if (f.get("grant_type") !== "authorization_code") return json(400, { error: "unsupported_grant_type" });
    const code = f.get("code") ?? "";
    const entry = codes.get(code);
    codes.delete(code); // single use
    const invalid = () => json(400, { error: "invalid_grant", error_description: "The code is invalid, expired or already used." });
    if (!entry || entry.exp < Date.now() || entry.redirectUri !== f.get("redirect_uri") || !linked) return invalid();
    const verifier = f.get("code_verifier") ?? "";
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || createHash("sha256").update(verifier).digest("base64url") !== entry.challenge) return invalid();
    const p = profile();
    const accessToken = await new SignJWT({ email: p.identity.email, name: p.identity.name, scope: "profile:read", sv: 0 })
      .setProtectedHeader({ alg: "ES256", kid: jwk.kid, typ: "JWT" }).setIssuer(ISSUER).setAudience(CLIENT_ID).setSubject(SUBJECT)
      .setIssuedAt().setExpirationTime("15m").setJti(crypto.randomUUID()).sign(privateKey);
    return json(200, { access_token: accessToken, token_type: "Bearer", expires_in: 900, scope: "profile:read", user: { id: SUBJECT, email: p.identity.email, name: p.identity.name } });
  }

  if (url.pathname === "/api/integrations/jwks") return json(200, { keys: [jwk] });

  if (url.pathname === "/api/integrations/v1/profile") {
    const bearer = (req.headers.authorization ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    try {
      if (!bearer) throw new Error("no token");
      await jwtVerify(bearer, localJwks, { issuer: ISSUER, audience: CLIENT_ID, algorithms: ["ES256"] });
    } catch { return json(401, { error: "invalid_token", message: "Missing, invalid or expired access token." }); }
    if (!linked) return json(401, { error: "invalid_token", message: "The user disconnected this app." });
    return json(200, profile());
  }

  json(404, { error: "not_found" });
}).listen(PORT, () => console.log(`MOCK AI Tathastu (not real SSO) on ${SELF}; client origin ${CLIENT_ORIGIN}`));
