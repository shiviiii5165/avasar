/**
 * LOCAL MOCK of AI Tathastu's integration endpoints, for development and browser E2E only.
 * It is NOT AI Tathastu and NOT real SSO. It mirrors the contract verified from AI Tathastu's source
 * (authorize with PKCE S256 + prompt, form-encoded token exchange returning an ES256 access token,
 * JWKS, ProfessionalProjectionV1 profile) so Avsar's real verification code runs unchanged.
 *
 * Usage: npx tsx scripts/mock-ait.mts   (port MOCK_AIT_PORT, default 3401). Refuses to run in production.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

if (process.env.NODE_ENV === "production") throw new Error("mock-ait must never run in production");

const PORT = Number(process.env.MOCK_AIT_PORT ?? 3401);
const ISSUER = `http://localhost:${PORT}`;
const CLIENT_ID = process.env.MOCK_AIT_CLIENT_ID ?? "avsar";
const CLIENT_SECRET = process.env.MOCK_AIT_CLIENT_SECRET ?? "mock-only-secret";
const SUBJECT = "mock-ait-user-1";

const { publicKey, privateKey } = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(publicKey)), kid: "mock-1", alg: "ES256", use: "sig" };

const codes = new Map<string, { challenge: string; redirectUri: string; exp: number }>();
const consented = new Set<string>();

const PROFILE = {
  schema: "ProfessionalProjectionV1",
  version: 1,
  identity: { id: SUBJECT, email: "meera.mock@example.invalid", name: "Meera Iyer", headline: "Final-year Computer Science student", avatarUrl: null, careerRole: { id: "frontend", label: "Frontend Developer" }, location: { city: "Pune", country: "India" } },
  education: [{ institution: "College of Engineering Pune", degree: "B.Tech", fieldOfStudy: "Computer Science", dates: "2022 - 2026", grade: "8.4 CGPA" }],
  skills: { items: ["React", "TypeScript", "HTML", "CSS", "Git", "JavaScript"].map((name) => ({ name, category: null, verified: false, verificationStatus: null, proficiency: null, level: null })) },
  projects: [{ key: "campus-events", title: "Campus events app", description: "A React app students use to find college events.", technologies: ["React", "TypeScript"], links: [] }],
  experience: [{ organization: "Pixel Labs", role: "Frontend Intern", dates: "Jun 2025 - Aug 2025", description: "Built accessible UI components." }],
  achievements: [{ type: "certification", title: "Responsive Web Design", issuer: "freeCodeCamp", date: "2024", url: null }],
  goals: null,
  privacy: { scopes: { education: true, skills: true, projects: true, experience: true, achievements: true }, masked: [] },
};

const body = async (req: IncomingMessage) => {
  let s = "";
  for await (const c of req) s += c;
  return new URLSearchParams(s);
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", ISSUER);
  const json = (status: number, v: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
  const back = (redirectUri: string, params: Record<string, string>) => {
    const u = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    res.writeHead(302, { location: u.toString() }); res.end();
  };

  if (url.pathname === "/integrations/authorize" || url.pathname === "/integrations/authorize/approve") {
    const q = url.searchParams;
    const redirectUri = q.get("redirect_uri") ?? "";
    if (q.get("client_id") !== CLIENT_ID || !redirectUri.startsWith("http://localhost:")) return json(400, { error: "invalid_client" });
    if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) return json(400, { error: "invalid_request" });
    const issue = () => {
      const code = randomBytes(24).toString("base64url");
      codes.set(code, { challenge: q.get("code_challenge")!, redirectUri, exp: Date.now() + 60_000 });
      consented.add(SUBJECT);
      back(redirectUri, { code, state: q.get("state") ?? "" });
    };
    if (url.pathname.endsWith("/approve")) return issue();
    if (q.get("prompt") === "none") return consented.has(SUBJECT) ? issue() : back(redirectUri, { error: "consent_required", state: q.get("state") ?? "" });
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><title>MOCK AI Tathastu</title>
<body style="font-family:system-ui;max-width:480px;margin:60px auto;padding:0 16px">
<p style="background:#fde68a;padding:8px 12px;border-radius:6px"><strong>MOCK provider for local testing.</strong> This is not AI Tathastu.</p>
<h1>Share your profile with Avsar?</h1><p>Signed in as Meera Iyer (mock). Avsar will receive your education, skills, projects, experience and achievements.</p>
<a id="approve" href="/integrations/authorize/approve?${q.toString()}" style="display:inline-block;background:#3b2a7a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Allow</a>
<a href="${new URL(redirectUri).origin}${new URL(redirectUri).pathname}?error=access_denied&state=${encodeURIComponent(q.get("state") ?? "")}">Cancel</a></body>`);
  }

  if (url.pathname === "/api/integrations/sso/token" && req.method === "POST") {
    const f = await body(req);
    if (f.get("client_id") !== CLIENT_ID || f.get("client_secret") !== CLIENT_SECRET) return json(401, { error: "invalid_client" });
    const entry = codes.get(f.get("code") ?? "");
    codes.delete(f.get("code") ?? "");
    if (!entry || entry.exp < Date.now() || entry.redirectUri !== f.get("redirect_uri")) return json(400, { error: "invalid_grant" });
    const challenge = createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url");
    if (challenge !== entry.challenge) return json(400, { error: "invalid_grant", error_description: "PKCE verification failed" });
    const accessToken = await new SignJWT({ email: PROFILE.identity.email, name: PROFILE.identity.name, scope: "profile:read", sv: 1 })
      .setProtectedHeader({ alg: "ES256", kid: jwk.kid }).setIssuer(ISSUER).setAudience(CLIENT_ID).setSubject(SUBJECT)
      .setIssuedAt().setExpirationTime("15m").sign(privateKey);
    return json(200, { access_token: accessToken, token_type: "Bearer", expires_in: 900, scope: "profile:read", user: { id: SUBJECT, email: PROFILE.identity.email, name: PROFILE.identity.name } });
  }

  if (url.pathname === "/api/integrations/jwks") return json(200, { keys: [jwk] });

  if (url.pathname === "/api/integrations/v1/profile") {
    if (!(req.headers.authorization ?? "").startsWith("Bearer ")) return json(401, { error: "unauthorized" });
    return json(200, PROFILE);
  }

  json(404, { error: "not_found" });
}).listen(PORT, () => console.log(`MOCK AI Tathastu (not real SSO) on ${ISSUER}`));
