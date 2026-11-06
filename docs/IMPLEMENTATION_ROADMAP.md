# Implementation roadmap

| Release | Scope | Status |
|---|---|---|
| R0 Foundation | Architecture, design tokens, docs, schema and migrations, test harness | Done |
| R1 Complete UI | Animated landing, public site, sign-in, onboarding, dashboard, discovery, details, applications, profile, Admin Studio, Employer foundation, responsive | Done, with real data, not mocks |
| R2 Core platform | PostgreSQL, APIs/actions, identity adapter, profiles, resumes, opportunity management, search, admin publishing, private documents | Done, except the S3 storage implementation and live SSO (blocked on D-04) |
| R3 Opportunity intelligence | Eligibility, matching, explanations, skill evidence, insights foundation | Done |
| R4 Applications | Forms, submission, snapshots, history, tracking, notifications | Done; email needs a provider webhook |
| R5 Trust & administration | Moderation, reports, roles, audit, support, health | Done. Organization verification UI is ready, but requests only arrive with R6 |
| R6 Employer workspace | Organization onboarding, verification, members, publishing, applicants, interviews | Foundation only (schema, gate) |
| R7 Advanced intelligence | Resume parsing, skill-gap depth, recommendations, AI discovery | Planned |
| R8 Ecosystem | Scholarships, fellowships, competitions, research, institutions, monetization, Collaborate | Planned (enums and `details` ready) |
| R9 Production readiness | Staging, security and performance testing, backup and restore drills, monitoring, launch gate | Planned; see OPERATIONS.md |

## Next steps, in order
1. **AI Tathastu registers the Avsar client** (D-04); then run SSO against staging.
2. **Production storage:** S3-compatible implementation with encryption and malware scanning.
3. **Infrastructure:** provision Avsar's own Postgres, web, worker and email webhook; set up CI (lint, typecheck, test, build, audit).
4. **Edge controls:** rate limiting and error monitoring.
5. **Legal review** of privacy, terms and retention.
6. **Employer Studio (R6)** behind its gate.
