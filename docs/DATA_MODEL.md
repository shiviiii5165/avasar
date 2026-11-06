# Data model

The authoritative definition is `src/server/db/schema.ts`. Migrations live in `src/server/db/migrations` and are generated with `npm run db:generate`. The database is PostgreSQL and is owned by Avsar only.

| Group | Tables | Rules |
|---|---|---|
| Identity | `user_identities`, `sessions`, `oauth_flows`, `admin_roles` | Unique (provider, subject). No passwords. Sessions store a SHA-256 of the token. OAuth flows are single use with a 10-minute expiry |
| Candidate | `candidate_profiles`, `education`, `experiences`, `projects`, `certifications`, `candidate_skills`, `skill_evidence` | One profile per identity. Visibility defaults to private. Skills unique per normalized name. Children cascade |
| Documents | `documents`, `resumes`, `document_access_log` | Bytes in private storage (`storage_key`). Soft delete keeps documents referenced by submitted applications |
| Organizations (R6) | `organizations`, `organization_members`, `organization_invitations`, `verification_requests`, `verification_evidence` | Invitation tokens hashed |
| Opportunities | `opportunity_sources`, `opportunities`, `opportunity_skills`, `opportunity_eligibility`, `opportunity_versions`, `import_records` | Unique slug. Status drives visibility. `details` jsonb holds category fields. Every save is versioned. `is_sample` flags demo data |
| Engagement | `saved_opportunities`, `saved_searches`, `recently_viewed` | Composite keys |
| Applications | `applications`, `application_answers`, `application_events` | Unique (opportunity, profile) and unique idempotency key. Profile, version, resume and consent snapshots. Append-only events |
| Recruitment (R6) | `assessments`, `interviews`, `internal_notes`, `messages` | — |
| Notifications | `notifications`, `notification_preferences` | Unique `dedupe_key` |
| Trust | `opportunity_reports`, `moderation_cases`, `support_tickets` | Severity derived from report reason |
| Audit/analytics | `audit_logs`, `analytics_events` | Append-only |
| Jobs | `jobs` | Unique idempotency key; index on (status, run_at) |

**Statuses:**
- **Opportunity:** draft, imported, in_review, approved, published, paused, closed, expired, rejected, suspended. Only published with an open deadline is public.
- **Application:** draft, submitted, viewed, under_review, shortlisted, assessment, interview, offered, selected, rejected, withdrawn, closed.
- **Organization verification:** unverified, pending, under_review, verified, rejected, suspended, expired.

**Deletion:**
- Account deletion removes sections, skills, resumes and saved items, scrubs personal fields, clears identity name and email, and revokes sessions.
- Submitted applications keep their snapshot, as the consent discloses.
- Retention periods for audit logs and events still need legal sign-off.
