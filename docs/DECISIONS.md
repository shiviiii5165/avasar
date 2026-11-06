# Decisions

| ID | Decision | Why |
|---|---|---|
| D-01 | Folder `E:\ecosystem tathastu\avasar` (the founder's folder), not `Avsar` | Founder created this folder for the project |
| D-02 | Next.js 16 + TypeScript + Tailwind v4 modular monolith; Drizzle ORM instead of Prisma | "Prisma or equivalent". Drizzle gives typed SQL, plain SQL migrations and runs on PGlite for tests |
| D-03 | PostgreSQL in staging and production; embedded PGlite for local dev and tests only | Zero-setup development and real-Postgres semantics in tests; production refuses the embedded DB |
| D-04 | AI Tathastu SSO through a dedicated **Avsar** OAuth client; adapter built and tested against simulated JWKS and token endpoints. **Blocker:** AI Tathastu must register client `avsar` (redirect `https://<avsar-domain>/api/auth/callback`, scopes, audience) and confirm the token claims. Avsar did not change AI Tathastu | Isolation rule: never reuse Collaborate's client or touch another product |
| D-05 | Development sign-in with synthetic personas, behind `AVSAR_DEV_AUTH=1` and disabled in production | Lets the product be exercised before D-04 is resolved, without weakening production security |
| D-06 | Avsar keeps its own sessions (DB table, hashed token) and doesn't store provider access tokens | Least data; revocation under Avsar's control |
| D-07 | Matching weights 0.30/0.20/0.15/0.15/0.10/0.10 are configurable hypotheses. Factors without data are "not assessed", not zero, and completeness is shown | Avoids penalising sparse profiles; honest about uncertainty |
| D-08 | Eligibility is a separate engine; a deadline is a gate, not evidence | A high match can never override a hard requirement |
| D-09 | Editing a published listing sends it back to review | Published content is always reviewed content |
| D-10 | Seeded data is flagged `is_sample`, badged, noindexed and excluded from metrics | No fabricated listings or statistics |
| D-11 | Until Employer Studio, Avsar staff update application statuses on behalf of organizations; every change is recorded with actor `admin` | Keeps candidate tracking real without exposing unfinished employer tools |
| D-12 | Email delivery through an HTTPS webhook adapter (provider-agnostic); without it, emails are logged | No vendor lock-in or secrets in this release |
| D-13 | Private storage adapter: local disk in development; S3-compatible implementation required before production | Keeps upload security testable now |
| D-14 | Resume intelligence, AI discovery and advanced career features deferred to Release 7 | Platform must not depend on AI; candidates must confirm any extraction |
| D-15 | Forms submit through transitions so input is kept on validation errors | React 19 resets forms after actions by default |
