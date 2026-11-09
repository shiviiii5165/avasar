# Implementation status: master correction instruction

Updated 2026-11-06. "Done" means implemented and verified by typecheck, lint, tests and build. Nothing here has been deployed or pushed.

| Phase | Status | Notes |
|---|---|---|
| 0 Audit | Done | See REMOVAL_AUDIT.md, AI_TATHASTU_INTEGRATION.md |
| 1 Public explore, AI Tathastu-only student auth, remove onboarding | **Done (code)** | Onboarding route, actions, completeness, redirects and columns removed via forward migrations. Public pages need no login. Verified in a real browser. |
| 2 SSO + automatic profile import | **Done (code); real SSO blocked** | Verified contract; provenance, idempotent sync, ownership and conflict policy, audit; 6 sync/mapper tests. Full browser journey verified against a local MOCK provider (`scripts/mock-ait.mts`). Real SSO blocked on AI Tathastu registering the `avsar` client. |
| 3 Recommended for You | Done | Post-login page `/app/discover`: Recommended for You first, then Jobs / Internships / Freelance & Gigs / All with search and sort. Ranks by match; only failed hard requirements sink (unknown is not a penalty), keeps eligibility separate from match, and shows a limited-data notice. Missing data is unknown. Shared pure module `domain/recommend.ts` (dashboard and Discover use the same ranking); 16 dedicated tests. |
| 4 Contextual apply + return-after-auth | Done | Apply asks, inside the application, only for unknown mandatory requirements (education, graduation year, work authorization), validates them server-side, stores them in the snapshot and answers, and saves them to Avsar-owned profile fields only on opt-in; signed-out Save/Apply return after sign-in (`?intent=save` saves idempotently). |
| 5 Admin Studio / imports | Existing; publish flow, status update and least privilege re-verified in browser | Imports land in review and never auto-publish (existing tests). |
| 6 Employer Studio | Done (gated) | `/studio`, behind `AVSAR_FEATURE_EMPLOYER_STUDIO` (on in development, off in production until enabled). Organizations, verification requests (decided in Admin Studio), members, roles, one-time invitation links (never email-matched), drafts → submit for review (Avsar approves/publishes; employers can only pause/resume/close approved listings), applicant pipeline with search/filters, snapshot view, short-lived resume links for authorized roles, internal notes, interviews with feedback, assessments with results, candidate messaging with replies, activity history, funnel analytics with definitions. Org isolation enforced in the service layer; 9 unit tests and an 11-step browser test (incl. cross-organization 404s). |
| 7 AI features (provider abstraction) | Not started | |
| 8 Additional categories | Not started | |
| 9 Production readiness | Not started | S3 adapter, email sink, rate limiting, monitoring, CI, health check, backups. |
| Hydration warning | Resolved (test harness) | Cause: Playwright's default screenshot `caret: "hide"` injects `style="caret-color: transparent"` into inputs; a screenshot during hydration made React report a mismatch (6/6 reproduced; 0/6 with `caret: "initial"`). App rendering is deterministic; no app change. E2E screenshots now use `caret: "initial"`. |
