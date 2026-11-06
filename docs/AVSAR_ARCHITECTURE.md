# Avsar architecture

Avsar is an **independent modular monolith**: one Next.js 16 application (UI, server actions, route handlers) with separated domain modules, its own PostgreSQL database, private storage and a background worker. It shares nothing with AI Tathastu or Collaborate except AI Tathastu sign-in, through Avsar's own OAuth client.

```
Browser ─► Next.js app (src/app): public site, /app (candidate), /admin (Admin Studio)
             ▼ server actions / route handlers
       src/server/services  DB-backed use cases (opportunities, profiles, applications, documents,
             │              engagement, notifications, trust, admin, jobs)
             ▼
       src/server/domain    pure rules (eligibility, matching, workflows, permissions,
             │              skills): no DB or framework, unit-tested
             ▼
       src/server/db        Drizzle schema + versioned SQL migrations ─► PostgreSQL
       scripts/worker.ts    durable jobs (retries, backoff, dead letter) ─► same DB
       storage adapter      private object storage (local disk in dev; S3-compatible next)
       AI Tathastu SSO      Authorization Code + PKCE S256, JWKS-verified tokens
```

## Modules
| Area | Code | Notes |
|---|---|---|
| Public website | `src/app/(public)` | Animated doorway landing, explore, details, content pages, sign-in |
| Identity | `src/server/auth` | AI Tathastu adapter, own DB sessions (hashed tokens), dev sign-in (never in production) |
| Candidate | `src/app/app`, `services/profiles.ts` | No onboarding: profile imported from AI Tathastu (`services/profile-sync.ts`) with provenance; personalized opportunities (Recommended for You first), profile, resumes, saved, insights, settings |
| Opportunities | `services/opportunities.ts`, `domain/workflows.ts` | Search, authoring, versions, publish pipeline, import pipeline |
| Eligibility / matching | `domain/eligibility.ts`, `domain/matching.ts` | Separate, deterministic, explained |
| Applications | `services/applications.ts` | Transactional submit, idempotency, snapshots, history |
| Documents | `services/documents.ts`, `api/documents/[id]` | Content sniffing, limits, private storage, 5-minute per-viewer signed links |
| Trust & safety | `services/trust.ts` | Report → case → severity → action → audit |
| Notifications | `services/notifications.ts`, `services/jobs.ts` | In-app (deduplicated) + email jobs |
| Admin Studio | `src/app/admin`, `services/admin.ts` | 16 sections; least privilege enforced server-side |
| Employer Studio | schema + `/employer` | Tables exist; self-service gated off (Release 6) |

## Runtime
- **Database:** PostgreSQL via `DATABASE_URL`. Local development falls back to embedded PGlite in `.data/`; production refuses it.
- **Migrations:** SQL migrations come from `npm run db:generate` and are applied with `npm run db:migrate` as a deploy step.
- **Worker:** `npm run worker` claims jobs with `FOR UPDATE SKIP LOCKED`, uses exponential backoff, dead-letters failures, reaps stale locks and stops gracefully.
- **Storage:** private storage behind a `put/get/remove` adapter. Local disk in development; an S3 implementation is still needed for production.
- **SEO:** JobPosting structured data is emitted only for real published listings, never samples.

## Failure behaviour
| Down | Behaviour |
|---|---|
| AI Tathastu | "Provider unavailable" on sign-in; browsing continues; no insecure fallback |
| Email provider | Retries with backoff, then dead letter; the application and in-app notification are unaffected |
| Database | Search shows "temporarily unavailable"; transactions prevent partial writes |
| Worker crash | Locks expire after 5 minutes and jobs re-queue; handlers are idempotent |
| AI provider | Not used by core features |
