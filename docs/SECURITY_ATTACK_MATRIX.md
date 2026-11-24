# Security attack matrix (owner's list A–G)

Branch `fix/security-matching-hardening`, 2026-11-24. Item wording is copied exactly from the owner's original
security prompt (sections A–G, 110 items). Nothing was run against production; production was only read through
public, unauthenticated GET/POST probes that change nothing.

**Status:** PASS = verified, no issue · FIXED = issue found, fixed, regression test added · PARTIAL = part verified or
a residual gap is listed · NOT TESTED = not executed (reason given) · N/A = not part of this architecture.
**Evidence:** `test` = automated test in the repo (file named) · `code` = code inspection in this review ·
`live` = read-only probe of avsar.aitathastu.com.

Architecture facts that decide many rows: Next.js 16 on Vercel (serverless, no containers, no open ports of its
own); PostgreSQL through Drizzle (parameterized queries only); sign-in ONLY through AI Tathastu OAuth (no Avsar
passwords); private documents in object storage behind session + signed, per-viewer links; optional Claude resume
extraction with no tools.

## A. Web application and API vulnerabilities

| # | Attack | Status | Evidence |
|---|---|---|---|
| A1 | SQL injection and unsafe query construction | PASS | code: Drizzle builders and `sql` tagged templates only; no `sql.raw` anywhere in `src/` |
| A2 | Cross-site scripting: reflected, stored, and DOM-based | PASS | code: React text rendering; the one raw-HTML spot (JSON-LD, `opportunities/[slug]`) escapes `<`; test: `ingestion.test.ts` "reduces HTML to inert text". Enforced CSP still allows inline scripts; the nonce policy is in report-only mode (see E9) |
| A3 | Cross-site request forgery | PASS | code: server actions get Next's built-in Origin check; `/api/auth/dev` checks `sameOrigin`; session cookie `SameSite=Lax`; there are no state-changing GET routes |
| A4 | Clickjacking and unsafe iframe embedding | PASS | live: `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` |
| A5 | Open redirects | PASS | test: `tathastu.test.ts` "only allows same-site relative return paths", `return-path.test.ts` "encoded slashes stay a same-origin path" |
| A6 | Server-side request forgery | PASS | test: `ingestion.test.ts` (private/metadata ranges, DNS rebinding, redirect re-validation, host allow-list) |
| A7 | Path traversal and arbitrary file access | PASS | code: storage keys are server-generated ids under `documents/`; no user-supplied path reaches the filesystem or bucket |
| A8 | Local/remote file inclusion where applicable | N/A | no dynamic `import`/`require` of user input; no template engine |
| A9 | Insecure file upload and file-processing vulnerabilities | PASS | test: `remediation.test.ts` (zip bomb, damaged zip, oversize, unknown type, malformed PDF); `services.test.ts` "validates by content, not name" |
| A10 | Broken access control | PASS | code: every admin action calls `guard(permission)` (admin.ts, 19 actions); test: `domain.test.ts` "is least privilege" |
| A11 | IDOR/BOLA and cross-user data access | PASS | code: every candidate action takes the profile from the session and every service filters by owner (skills, sections, resumes, saved searches, learning evidence, applications); test: `employer.test.ts` "organization B can't…", `intelligence-pipeline.test.ts` "another student can't…" |
| A12 | Privilege escalation and role confusion | PASS | test: `employer.test.ts` "never lets an organization approve or publish", `remediation.test.ts` "only Super Admin can open any candidate"; `grantRoleAction` requires `role.grant` |
| A13 | Authentication and session management weaknesses | PASS | test: `services.test.ts` "stores only a hash", `tathastu.test.ts` "revoked sessions stop resolving"; code: callback revokes the previous session |
| A14 | Insecure direct object references in jobs, files, reports, messages, applications, and collaboration resources | PASS | as A11; documents need session **and** a signature bound to the viewer (`/api/documents/[id]`); collaboration resources do not exist in Avsar |
| A15 | Mass assignment and unsafe property updates | PASS | code: every action parses forms with explicit zod schemas; profile/owner ids never come from the form |
| A16 | Improper input validation and unsafe deserialization | PASS | code: zod on every action, webhook and partner query; `JSON.parse` only after signature verification; no `eval`/`new Function` |
| A17 | Security misconfiguration | PARTIAL | test: `remediation.test.ts` (server refuses to start without critical settings); live: `/api/health` reports storage and email failing in production |
| A18 | Information disclosure and verbose errors | PASS | code: APIs answer fixed codes; webhook errors are stored truncated, not returned; `production.test.ts` "redacts tokens and masks emails" |
| A19 | Cache poisoning or cache authorization issues where applicable | PASS | code: private responses `cache-control: private, no-store` (documents, export, partner API); proxy overwrites the client-supplied return-path header (test: `return-path.test.ts`) |
| A20 | Race conditions and duplicate-operation bugs | PASS | test: `ait-webhooks.test.ts` "concurrent provisioning… exactly one identity", `source-coverage.test.ts` "leases each due source once", `services.test.ts` "replays are idempotent" |
| A21 | Business-logic abuse | PASS | test: `services.test.ts` "refuses duplicates, missing consent… closed listings", "never publishes without review" |
| A22 | Missing or incorrect security headers | PARTIAL | live: HSTS, nosniff, XFO, Referrer-Policy, Permissions-Policy present. FIXED in code: strict nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-inline`) is ENFORCED on Vercel previews and wherever `AVSAR_CSP_MODE=enforce`; production stays report-only until the owner switches it after checking the preview. Local check with enforcement: one CSP header, every script nonced on `/`, `/terms`, `/opportunities`, `/sign-in`, and 0 CSP violations in headless Chromium (`csp.test.ts` covers the mode switch). Residual: production setting |
| A23 | CORS and origin validation | PASS | code: no `Access-Control-Allow-*` header anywhere, so browsers block cross-origin reads by default |
| A24 | API versioning and deprecated endpoint exposure | PASS | code: one versioned partner API (`/api/partner/v1`); the dev sign-in returns 404 in production (proxy + `devAuthEnabled`) |

## B. Authentication and account security

| # | Attack | Status | Evidence |
|---|---|---|---|
| B1 | Brute-force resistance | N/A | Avsar has no passwords; sign-in is delegated to AI Tathastu (that side was tested in the AI Tathastu assessment) |
| B2 | Password spraying resistance | N/A | as B1 |
| B3 | Credential-stuffing defenses using synthetic test credentials only | N/A | as B1 |
| B4 | Login rate limits and throttling | PASS | code: `login` 20/min and `callback` 30/min per IP (`rate-limit.ts`); test: `production.test.ts` limiter |
| B5 | Account enumeration | PASS | code: no email lookup endpoint; responses are the same whether or not an account exists |
| B6 | Password reset and recovery flow | N/A | no Avsar passwords |
| B7 | Email verification and account activation | PASS | code: email taken only from AI Tathastu's verified sign-in; accounts link by provider subject, never email (test: `services.test.ts`, `ait-webhooks.test.ts` "same EMAIL but another subject is untouched") |
| B8 | MFA/passkey behavior if implemented | N/A | handled by AI Tathastu |
| B9 | Session fixation | PASS | code: the callback revokes any existing session and issues a new random token (`callback/route.ts`) |
| B10 | Session expiration and revocation | PASS | test: `tathastu.test.ts` "revoked sessions stop resolving (logout)"; account deletion revokes sessions (`ait-webhooks.test.ts`) |
| B11 | Cookie security: HttpOnly, Secure, SameSite | PASS | code: `session.ts` HttpOnly, Secure in production, SameSite=Lax |
| B12 | JWT validation, expiry, issuer, audience, and algorithm handling | PASS | test: `tathastu.test.ts` (wrong issuer/audience/expiry/scope, forged key), `jwks.test.ts` (non-ES256 refused), `partner-opportunities.test.ts` |
| B13 | Refresh-token rotation and replay protection | N/A | the contract issues no refresh token; access tokens are used once and never stored |
| B14 | OAuth state and PKCE validation | PASS | test: `tathastu.test.ts` "PKCE S256", "rejects unknown, missing, replayed and expired state" |
| B15 | SSO callback validation | PASS | test: `tathastu.test.ts` "maps an expired or replayed authorization code to invalid_grant" |
| B16 | Logout and account-switching behavior | PASS | test: `tathastu.test.ts` logout; code: sign-in as another account replaces the session |

## C. Authorization, privacy, and data isolation

| # | Attack | Status | Evidence |
|---|---|---|---|
| C1 | Cross-user access to private resources | PASS | as A11 |
| C2 | Cross-tenant access if multi-tenancy exists | PASS | test: `employer.test.ts` "organization B can't…" |
| C3 | Operator/admin authorization | PASS | as A10 |
| C4 | Ownership validation on every sensitive API | PASS | code review of all candidate actions (A11) and API routes (`documents`, `me/export`) in this pass |
| C5 | Unauthorized read, update, delete, download, and export | PASS | `/api/me/export` returns only the session's own data; downloads need session + viewer-bound signature + ownership re-check |
| C6 | Private profile and resume access | PASS | test: `employer.test.ts` "resume documents: the receiving organization only, and audited" |
| C7 | Sensitive data exposure in API responses | PASS | code: the export leaves out storage keys and internals; the partner API returns listings only |
| C8 | PII leakage in logs, traces, error messages, or prompts | PASS | test: `production.test.ts` redaction; `ai.test.ts` "redacts contact details before text is sent to a provider" |
| C9 | Consent boundaries between AI Tathastu, Collaborate, and AVSAR | PARTIAL | test: per-section consent and audience checks (`profile-sync.test.ts`, `ait-webhooks.test.ts`, which also reject `aud=collaborate`). **Gap (configuration):** production answers 503 to AI Tathastu events, so consent withdrawal and account deletion are not delivered until `AVSAR_AIT_WEBHOOK_SECRET` is set in both apps |
| C10 | Data deletion and retention behavior | PARTIAL | test: `ait-webhooks.test.ts` "account_deleted deletes the Avsar account…", "user_disconnected removes AI Tathastu data". FIXED: deletion left saved listings, saved searches (typed queries), recently viewed, notifications, preferences and admin roles on the minimized account; now erased, analytics unlinked (`services.test.ts` "account deletion erases…"). Residual: same production webhook gap as C9 |
| C11 | Access to private files through predictable URLs | PASS | code: random ids + HMAC signature bound to viewer and expiry (`verifyDocumentSignature`) |
| C12 | Authorization consistency between UI and backend | PASS | code: hidden buttons are never the control; every action re-checks on the server |

## D. AI, LLM, and agent security

Avsar's only model use is the optional resume extractor (`server/ai/anthropic.ts`, off unless
`AVSAR_AI_PROVIDER=anthropic`). It has no tools, no retrieval/vector store and no agent loop. Matching is
rule-based and uses no model.

| # | Attack | Status | Evidence |
|---|---|---|---|
| D1 | Direct prompt injection | PASS | the student's own resume is the only input; the output is schema-validated and grounded (test: `ai.test.ts` "drops fabricated items", "rejects an item whose value isn't in the resume") |
| D2 | Indirect prompt injection through uploaded documents and retrieved content | PASS | test: `ingestion.test.ts` "flags prompt injection…", `fenceUntrusted`; flagged listings cannot be published (`intelligence-pipeline.test.ts`) |
| D3 | System-prompt disclosure attempts | PASS | the output is a fixed zod schema; free text cannot be returned to the user |
| D4 | Secret and credential leakage | PASS | the key stays server-side; contact details are redacted before sending (`ai.test.ts`) |
| D5 | Data exfiltration through model output | PASS | suggestions are applied only after the student confirms and are re-checked against the resume (`ai.test.ts` "tampering is ignored") |
| D6 | Unsafe tool invocation | N/A | no tools are defined |
| D7 | Tool permission escalation | N/A | no tools |
| D8 | Unauthorized cross-user retrieval | N/A | no retrieval; each call sees one resume of the signed-in owner |
| D9 | RAG/vector-store tenant isolation | N/A | no RAG or vector store |
| D10 | Retrieval poisoning using synthetic documents | N/A | no retrieval |
| D11 | Malicious or misleading document content | PASS | as D1/D2; job text is flagged and kept in review |
| D12 | Output validation and structured-output bypass | PASS | `zodOutputFormat` + grounding (`ai.test.ts`) |
| D13 | Model refusal and safety-boundary behavior | PASS | a failure or refusal falls back to the rules engine (`ai.test.ts` "falls back… when the AI provider throws") |
| D14 | Provider error handling and fallback behavior | PASS | as D13; 60 s timeout, 1 retry |
| D15 | Excessive token usage and cost-abuse controls | PASS | `resumeRead` 20/hour per person; `max_tokens` 16000; upload size caps |
| D16 | Agent loops and resource limits | N/A | no agent |
| D17 | Worker isolation | PASS | no per-user code execution; serverless functions are per request |
| D18 | Untrusted content handling | PASS | `sanitize.ts` (HTML→text, invisible characters removed, lengths capped) |
| D19 | Prompt injection that attempts to override application policy | PASS | test: `ingestion.test.ts` instruction-override and ranking-manipulation patterns + false-positive regressions |

## E. Network, infrastructure, and configuration

| # | Attack | Status | Evidence |
|---|---|---|---|
| E1 | Docker network isolation | N/A | Avsar runs on Vercel serverless; no Docker in its deployment |
| E2 | PentAGI/Kali egress restrictions | N/A | no attacker container exists for this project |
| E3 | No unintended default route from the isolated attacker container | N/A | as E2 |
| E4 | No production or public internet reachability from the isolated attacker container | N/A | as E2 |
| E5 | Only the intended isolated target is reachable | N/A | as E2 |
| E6 | Internal service exposure | PASS | live: internal routes need secrets (cron 401, partner API 401, webhook 503 until configured) |
| E7 | Unnecessary open ports | N/A | Vercel exposes only 443/80 |
| E8 | TLS and HTTPS configuration | PASS | live: HSTS max-age 2 years + includeSubDomains; the app refuses to start with an http public URL (seen locally) |
| E9 | Security headers | PARTIAL | as A22 (code ready; production switch is an owner decision after the preview) |
| E10 | Reverse-proxy trust configuration | PASS | test: `remediation.test.ts` "production without trusted-proxy config never trusts client headers" |
| E11 | `X-Forwarded-For` spoofing resistance | PASS | test: `remediation.test.ts` "a spoofed left-most entry is ignored" |
| E12 | DNS and host validation | PASS | test: canonical-host redirect (`remediation.test.ts`); SSRF DNS pinning (`ingestion.test.ts`) |
| E13 | Environment variable and secret exposure | PARTIAL | code: no secrets in the repo; reports print names only (`remediation.test.ts`). **Open:** Vercel, GitHub and Render tokens were pasted into chat earlier and must be rotated |
| E14 | Debug mode and development endpoints | PASS | code: `/api/auth/dev` returns 404 in production (proxy and route) |
| E15 | Container privilege and capability configuration | N/A | no containers |
| E16 | Dependency and package vulnerabilities | PASS | `npm audit --omit=dev`: 0 vulnerabilities (2026-11-24) |
| E17 | Build and deployment configuration risks | PARTIAL | pushing `main` deploys production automatically; branch protection and required reviews are not verified |

## F. Malware and social-engineering defense simulations

| # | Attack | Status | Evidence |
|---|---|---|---|
| F1 | Antivirus or upload scanning integration, if present | N/A | not present; only PDF/DOCX are accepted, validated by content, and served with `nosniff` |
| F2 | Dangerous file-type rejection | PASS | test: `remediation.test.ts` unknown types rejected; `services.test.ts` "validates by content, not name" |
| F3 | MIME-type and file-signature validation | PASS | as F2 |
| F4 | Suspicious document handling | PASS | zip-bomb and malformed-PDF tests (`remediation.test.ts`) |
| F5 | Macro-enabled or executable file rejection where relevant | PASS | only `.docx`/`.pdf` content types pass validation; `.docm` and executables are unknown types |
| F6 | Safe attachment handling | PASS | private bucket, signed per-viewer links, `cache-control: no-store`. FIXED: non-Latin file names made the download throw (500); RFC 6266 header + test (`http.test.ts`) |
| F7 | Phishing-resistant authentication controls | N/A | handled by AI Tathastu sign-in |
| F8 | User-reporting or abuse-reporting mechanisms, if present | PASS | test: `services.test.ts` "report → case → suspend…" |
| F9 | Security awareness and warning UI behavior, if implemented | PASS | external portal links are marked as external and not checked by Avsar |

## G. Availability and automated abuse

| # | Attack | Status | Evidence |
|---|---|---|---|
| G1 | Rate limits | PASS | `rate-limit.ts` (14 limits); test: `production.test.ts`, `remediation.test.ts` |
| G2 | Login and search throttling | FIXED | `search` 60/min on `/opportunities` and `/app/discover`: per identity when signed in, per client IP when the IP source is trusted. When production has no trusted IP header, anonymous visitors are NOT limited (one shared bucket would throttle everyone) and `/api/health` reports it: set `AVSAR_CLIENT_IP_HEADER` to close that (`production.test.ts` "search rate limit") |
| G3 | API quotas | PASS | partner API 120/min, fails closed (`partner-opportunities.test.ts`) |
| G4 | Queue limits | PASS | job retries with backoff and dead-letter (`services.test.ts`) |
| G5 | Request body limits | FIXED | the webhook body is now capped at 512 KB before signature work (`ait-webhooks.test.ts`); server actions at 4.5 MB |
| G6 | Upload size and page limits | PASS | 4 MB uploads; parser limits (`remediation.test.ts`) |
| G7 | Timeouts | PASS | outbound fetch 15–25 s; document parsing 15 s; cron 40 s budget inside 60 s |
| G8 | Concurrency controls | PASS | source leases, webhook delivery claims (tests in A20) |
| G9 | Cache behavior | PASS | as A19 |
| G10 | Expensive endpoint protection | PASS | Run now 6/hour per source; resume extraction 20/hour; ranking is capped at 5,000 listings |
| G11 | Graceful degradation | PASS | the webhook answers 503 retryable when unconfigured; storage outage shows a clear message (`storage.test.ts`) |
| G12 | Recovery after a bounded test | NOT TESTED | No load test has been run. Needs an isolated target (a Vercel preview with its own database, never production). Plan: a bounded run (for example 20 concurrent users for 2 minutes on `/opportunities`, `/opportunities/<slug>` and `/api/health/live`), then confirm error rate returns to 0 and p95 latency returns to baseline within 1 minute after the run stops. Stop at once if the error rate exceeds 5% |
| G13 | Resource usage under a small, controlled load | NOT TESTED | No load test has been run. Same isolated target and run as G12; record p50/p95 latency, function duration and database connections. Not run because no isolated environment with its own database exists yet |

## Summary

110 items: 77 PASS, 2 FIXED, 7 PARTIAL, 2 NOT TESTED, 22 N/A. Further fixes sit inside rows still marked PASS or
PARTIAL: the non-Latin download crash (F6), account-deletion leftovers (C10) and the strict CSP (A22, E9).
No critical or high vulnerability was found in the code.

The 7 PARTIAL items and what closes each:
- A17 production storage and email: provider accounts (owner).
- A22, E9 enforced CSP in production: set `AVSAR_CSP_MODE=enforce` after checking the preview (owner).
- C9, C10 consent withdrawal and deletion delivery: `AVSAR_AIT_WEBHOOK_SECRET` in both apps (owner).
- E13 tokens pasted in chat: rotate them (owner).
- E17 deployment protections: GitHub branch protection and required review on `main` (owner; not verified).

The 2 NOT TESTED items (G12, G13) are load tests. They have not been run and must not be read as passed.