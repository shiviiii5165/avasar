# Operations: local, staging, deployment, backup, incidents

Avsar runs on **its own** infrastructure. It never shares a database, secrets or OAuth client with AI Tathastu or Collaborate. No production action happens without explicit founder approval.

## Local development
```
npm install
npm run db:seed          # migrates the embedded DB in .data/ and inserts SAMPLE listings
AVSAR_DEV_AUTH=1 npm run dev     # http://localhost:3000; dev personas on /sign-in
npm run worker           # optional: process notification/expiry jobs
npm test && npm run typecheck && npm run lint && npm run build
```
- Stop the dev server before running `db:seed` (the embedded DB allows one process).
- Reset the local data by deleting `.data/`.

## Staging (new, isolated resources only)
1. **Database:** create a new PostgreSQL database (e.g. a new Neon project) for `avsar-staging`.
2. **Web:** create a Vercel project from this repository. Create a Render background worker running `npm run worker` with the same `DATABASE_URL`.
3. **Environment:** set variables from `.env.example`:
   - `DATABASE_URL` and a new `AVSAR_SIGNING_SECRET` (32+ random characters);
   - `AVSAR_PUBLIC_URL` and `AVSAR_AIT_*` for a **staging** Avsar client issued by AI Tathastu.
   - Never copy any value from another product.
4. **Migrate:** run `npm run db:migrate` (with `DATABASE_URL`) as the release step.
5. **Bootstrap admins:** set `AVSAR_BOOTSTRAP_SUPER_ADMINS=ai_tathastu:<subject>`. Sign in once, then grant roles in Admin › Configuration and remove the variable.
6. **Dev sign-in:** keep `AVSAR_DEV_AUTH` off in staging if staging runs with `NODE_ENV=production` (it is ignored there anyway).
7. **Smoke-test:** sign-in, onboarding, resume upload, apply, admin publish, report and suspend, audit log.

## Production deployment (after approval)
- **Same shape as staging,** with separate resources and secrets.
- **Order:** migrate, then deploy web, then deploy worker.
- **Migrations are additive.** Destructive changes need a multi-step plan: add, backfill, switch, then remove later.
- **Gates:** keep `AVSAR_FEATURE_EMPLOYER_PUBLISHING=0` until Release 6 passes its safety checks.

## Backup and restore
- **Database:** enable provider point-in-time recovery (7+ days) and a nightly logical dump (`pg_dump -Fc`) to a separate encrypted bucket.
- **Storage:** bucket versioning plus a lifecycle policy; replicate to a second region if required.
- **Restore drill (each quarter, staging):**
  1. Restore the latest dump to a new database.
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

## Monitoring (to configure)
- **Health:** Admin › System Health shows DB latency, queue depth, dead jobs and SSO configuration.
- **External tools (to add):** uptime checks on `/` and `/opportunities`, error monitoring with PII scrubbing, and an alert on dead jobs above 0.
