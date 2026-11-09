# Operations: local, staging, deployment, backup, incidents

Avsar runs on **its own** infrastructure. It never shares a database, secrets or OAuth client with AI Tathastu or Collaborate. No production action happens without explicit founder approval.

## Local development
```
npm install
npm run db:seed          # migrates the embedded DB in .data/ and inserts SAMPLE listings
AVSAR_DEV_AUTH=1 npm run dev     # http://localhost:3000; dev personas on /sign-in
npm run worker           # optional: process notification/expiry jobs
npm test && npm run typecheck && npm run lint && npm run build
npm run mock:ait         # optional: LOCAL MOCK of AI Tathastu on :3401 (not real SSO) for browser tests
```
- Emails go to `.data/outbox/*.json` in development; nothing is sent.
- Stop the dev server before running `db:seed` (the embedded DB allows one process).
- Reset the local data by deleting `.data/`.

## Staging (new, isolated resources only)
1. **Database:** create a new PostgreSQL database (e.g. a new Neon project) for `avsar-staging`.
2. **Web:** create a Vercel project from this repository. Create a Render background worker running `npm run worker` with the same `DATABASE_URL`.
3. **Environment:** set variables from `.env.example`:
   - `DATABASE_URL` and a new `AVSAR_SIGNING_SECRET` (32+ random characters);
   - `AVSAR_PUBLIC_URL` and `AVSAR_AIT_*` for a **staging** Avsar client issued by AI Tathastu.
   - Storage: a new private bucket (block all public access, versioning on) and `AVSAR_STORAGE_DRIVER=s3`, `AVSAR_S3_BUCKET`, `AVSAR_S3_REGION` (plus `AVSAR_S3_ENDPOINT` for R2/MinIO). Credentials via the host role or the secret store.
   - Email: a provider on a verified sending domain (SPF, DKIM, DMARC) and `AVSAR_EMAIL_WEBHOOK_URL`, `AVSAR_EMAIL_WEBHOOK_TOKEN`, `AVSAR_EMAIL_FROM`.
   - Monitoring: `AVSAR_ERROR_WEBHOOK_URL`, `AVSAR_HEALTH_TOKEN`, `AVSAR_ENV=staging`.
   - Never copy any value from another product.
4. **Migrate:** run `npm run db:migrate` (with `DATABASE_URL`) as the release step.
5. **Bootstrap admins:** set `AVSAR_BOOTSTRAP_SUPER_ADMINS=ai_tathastu:<subject>`. Sign in once, then grant roles in Admin › Configuration and remove the variable.
6. **Dev sign-in:** keep `AVSAR_DEV_AUTH` off in staging if staging runs with `NODE_ENV=production` (it is ignored there anyway).
7. **Check health:** `curl -H "x-health-token: …" https://<staging>/api/health` must report `status: ok` and no `missingSettings`.
8. **Smoke-test:** public explore, Continue with AI Tathastu, profile import, Recommended for You, save, apply (with a missing-answer question), tracking, admin publish, report and suspend, Employer Studio (if enabled), audit log.

## Production deployment (after approval)
- **Same shape as staging,** with separate resources and secrets.
- **Order:** migrate, then deploy web, then deploy worker.
- **Migrations are additive.** Destructive changes need a multi-step plan: add, backfill, switch, then remove later.
- **Gates:** `AVSAR_FEATURE_EMPLOYER_STUDIO` enables the employer workspace (publishing still requires Avsar approval); keep `AVSAR_FEATURE_EMPLOYER_PUBLISHING=0`.
- **CI** (`.github/workflows/ci.yml`) must be green: typecheck, lint, tests, `drizzle-kit check`, migrations on an empty PostgreSQL, production build, dependency audit.

### Deployment checklist
1. CI green on the commit; changelog reviewed.
2. `/api/health` on staging is `ok`; staging smoke test passed on the same commit.
3. Fresh backup taken (`npm run db:backup` against production, stored encrypted off-host) or provider snapshot confirmed.
4. Run migrations, deploy web, deploy worker.
5. Check `/api/health`, sign in, open a listing, and watch error reports for 30 minutes.

### Rollback
- **Code:** redeploy the previous build (Vercel "promote previous deployment"; Render "rollback"). Migrations are additive, so the previous build runs against the newer schema.
- **Data:** only for data damage, restore into a NEW database from the provider's point-in-time recovery, verify it on staging, then switch `DATABASE_URL`. `npm run db:restore` never targets production.

### Real AI Tathastu SSO go-live (after AI Tathastu registers the `avsar` client)
1. AI Tathastu's owner registers client `avsar` with the exact callback `https://<avsar-host>/api/auth/callback` and the profile scopes (see docs/AI_TATHASTU_INTEGRATION.md).
2. Put `AVSAR_AIT_CLIENT_ID=avsar`, `AVSAR_AIT_CLIENT_SECRET` and `AVSAR_AIT_BASE_URL` in the host's secret store (never chat or git).
3. In staging: sign in with a real account, confirm the profile import, refresh (`prompt=none`), reconnect (`prompt=consent`), sign out, and a denied consent. Only then repeat in production.

## Backup and restore
- **Objectives:** RPO 24 hours or better (minutes with point-in-time recovery); RTO 4 hours.
- **Database:** enable provider point-in-time recovery (7+ days) and a nightly logical dump to a separate encrypted bucket: `npm run db:backup` (pg_dump custom format; schedule it on the worker host or a cron job). Retain 30 daily and 12 monthly copies.
- **Storage:** bucket versioning plus a lifecycle policy; replicate to a second region if required.
- **Restore drill (each quarter, staging):**
  1. Restore the latest dump to a new database: set `AVSAR_ENV=staging`, `AVSAR_RESTORE_ALLOWED_HOSTS=<restore-db-host>`, `AVSAR_PRODUCTION_DB_HOST=<production-db-host>` and `DATABASE_URL=<restore-db>`, then `npm run db:restore -- backups/<file>.dump --confirm-host=<host> --confirm-database=<db>`. The script refuses unknown hosts, the production host, any production environment, and archives whose `.sha256` doesn't match.
  2. Point a staging deploy at it.
  3. Verify sign-in, listings, an application and a document download.
  4. Record the time taken.

## Incident response
1. **Triage:** severity S1 (outage or data exposure), S2 (major feature down), S3 (degraded).
2. **Contain:**
   - Revoke sessions (`update sessions set revoked_at = now()`) if they're compromised.
   - Rotate `AVSAR_SIGNING_SECRET` (invalidates document links).
   - Pause a listing or source in Admin Studio.
3. **Investigate** using `audit_logs`, `document_access_log`, the jobs dead letter and platform logs. Logs contain no secrets.
4. **Communicate:** notify affected users; data incidents may carry legal notification duties (founder and counsel decide).
5. **Review:** write a post-incident report and add a regression test.

## Monitoring
- **Liveness:** `GET /api/health/live` (process up; no dependency calls). Use it for the host's restart probe.
- **Readiness:** `GET /api/health` returns 200 (`ok`/`degraded`) or 503 (`fail`) with checks for database, storage, email, worker backlog, SSO and (production) configuration. With `x-health-token` it also lists missing settings by name and job counts; never values.
- **Startup validation:** in production the server logs `startup.env_invalid`; missing `DATABASE_URL`, `AVSAR_PUBLIC_URL` (https) or `AVSAR_SIGNING_SECRET` makes it refuse to serve (Next keeps the port open but answers nothing, so health checks fail).
- **Structured logs:** JSON lines with secrets and emails redacted (`src/server/log.ts`).
- **Error reports:** unhandled request errors are posted to `AVSAR_ERROR_WEBHOOK_URL` (Sentry relay, Slack or incident tool), redacted.
- **Alerts to configure in the monitoring tool:** health `fail` for 2 minutes; worker `fail` (jobs overdue 15+ minutes); dead jobs above 0; 5xx rate above 1%; repeated 429s from one network.
- **Admin › System Health** shows the same data inside Admin Studio.

## Abuse protection
Database-backed rate limits (`src/server/rate-limit.ts`) cover sign-in, callback, development sign-in (per IP), applications, uploads, reports, messages, invitations and resume reading (per person). They return a clear "try again later" message, never an error page. Signed-in flows fail open if the limiter breaks; the public support form fails closed and has a honeypot. Client IPs are only trusted via `AVSAR_CLIENT_IP_HEADER` or `AVSAR_TRUSTED_PROXY_HOPS` (see `.env.example`); otherwise production uses one shared bucket.