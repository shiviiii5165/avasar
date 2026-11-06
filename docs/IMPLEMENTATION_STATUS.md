# Implementation status: master correction instruction

Updated 2026-11-06. "Done" means implemented and verified by typecheck, lint, tests and build. Nothing here has been deployed or pushed.

| Phase | Status | Notes |
|---|---|---|
| 0 Audit | Done | See REMOVAL_AUDIT.md, AI_TATHASTU_INTEGRATION.md |
| 1 Public explore, AI Tathastu-only student auth, remove onboarding | **Done (code)** | Onboarding route, actions, completeness, redirects and columns removed via forward migrations. Public pages need no login. A browser E2E rerun is still pending. |
| 2 SSO + automatic profile import | **Done (code); real SSO blocked** | Verified contract; provenance, idempotent sync, ownership and conflict policy, audit; 6 sync/mapper tests. Blocked on AI Tathastu registering the `avsar` client. Mock-provider E2E not built. |
| 3 Recommended for You | Partial | Dashboard ranks open listings, excludes ineligible ones, keeps eligibility separate from match, and shows a limited-data notice. Missing data is unknown. No dedicated engine tests yet beyond the existing matching tests. |
| 4 Contextual apply + return-after-auth | Partial | `returnTo` is preserved through sign-in. `contextAnswersAction` exists but isn't yet wired into the apply page; `?intent=save` isn't done. |
| 5 Admin Studio / imports | Existing, not re-verified | Imports land in review and never auto-publish (existing tests). |
| 6 Employer Studio | Not started | |
| 7 AI features (provider abstraction) | Not started | |
| 8 Additional categories | Not started | |
| 9 Production readiness | Not started | S3 adapter, email sink, rate limiting, monitoring, CI, health check, backups. |
| Hydration warning | Unresolved | Seen only in the combined dev E2E run; not reproduced. |
