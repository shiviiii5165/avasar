# Security and privacy

## Implemented

**Authentication:**
- PKCE S256, single-use state with a 10-minute expiry, nonce, exact redirect URI, server-side exchange.
- Token checks: JWKS signature verification (key rotation handled), issuer, audience, expiry (30-second skew) and an algorithm allow-list.
- Accounts link by provider subject only, never by email. No passwords stored.

**Sessions:**
- A 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production) with a 7-day expiry.
- Only the token's SHA-256 is stored; revoked on logout and on account deletion.

**Authorization:**
- Every admin page and action checks a specific permission server-side.
- Six least-privilege roles.
- Candidate data is scoped by the caller's profile; other people's records return "not found".

**CSRF:** server-action origin checks, plus a same-origin `Origin` check on cookie POST routes.

**Open redirects:** blocked (`safeReturnTo`).

**Input:** zod validation; parameterized Drizzle queries; LIKE wildcards escaped.

**Output:** React escaping. The only raw HTML is JSON-LD, with `<` escaped.

**Uploads:**
- Content sniffing (PDF signature, or DOCX zip containing `word/document.xml`), 5 MB limit.
- Random keys, stored outside `public/`, served `nosniff` and `no-store`.
- HMAC links bound to the viewer, valid 5 minutes; access logged, and staff access audited.

**Headers:** CSP, frame denial, HSTS, Referrer-Policy, Permissions-Policy, nosniff; powered-by header off.

**Development auth:** off unless `AVSAR_DEV_AUTH=1`, and never in production (config check plus `proxy.ts`). Dev identities use provider `dev`.

**Secrets:**
- Only `.env.example` with placeholders is committed; `.env*` and `.data/` are git-ignored.
- Production requires `DATABASE_URL` and `AVSAR_SIGNING_SECRET`.
- Logs never contain tokens; email addresses are masked.

**Audit:** sign-in, publish transitions, imports, moderation, role grants, staff document views, visibility changes, applications and account deletion.

## Privacy by design
- Profiles are private by default; uploading a resume never makes anyone discoverable.
- Applicants see exactly what is shared. Snapshots are stored with explicit consent text; email and expected pay are not shared.
- Data export (`/api/me/export`) and account deletion (Settings).
- The admin candidate list shows minimal fields; documents aren't browsable.
- No AI provider receives candidate data. Personal data isn't sold.
- Sample listings are labelled, excluded from metrics and set to noindex.

## Open items
**Legal and founder decisions:**
- DPDP Act review, retention periods, grievance officer, cross-border transfers.
- Final Terms and Privacy text.
- Under-18 handling.
- Cookie notice (only an essential session cookie today).

**Engineering:**
- Edge rate limiting and bot protection; only report filing is rate-limited in-app today.
- CI dependency and secret scanning.
- Error monitoring with PII scrubbing.
- S3 private storage with encryption.
- Malware scanning of uploads.
