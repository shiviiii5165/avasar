# Progress — 2026-11-06

## Working now (real database, not mocks)
- **Brand experience:** animated doorway landing (CSS 3D door, light seam, floor spill, swaying leaves, waves), reduced-motion fallback, responsive. Centralized design tokens. WCAG-minded semantics: skip link, focus rings, labelled forms, announced status messages.
- **Public site:** 13 pages, SEO metadata, JobPosting structured data for real listings only.
- **Identity:** AI Tathastu SSO adapter (PKCE S256, JWKS verification), own hashed sessions, logout and revocation, gated dev sign-in.
- **Candidate:**
  - 16-step skippable onboarding; full talent profile with skill levels and evidence; visibility controls.
  - Resumes: private, content-validated, versioned, signed links.
  - Dashboard ("next useful action"), personalized discover, explore with filters, sorting and pagination.
  - Saved listings, saved searches, recently viewed, similar listings.
  - Eligibility and explained match on every listing.
  - Applications with integrity guarantees and a tracker; withdraw.
  - Notifications and preferences; career insights (skill gaps, evidence); data export and account deletion.
- **Admin Studio (16 sections):**
  - Overview metrics with definitions; opportunity authoring with versions, review → approve → publish → pause/close/suspend.
  - Source Manager with usage terms; JSON import → review queue.
  - Applications status management with candidate notification; moderation cases; candidates; organizations and verification.
  - Support tickets, notification deliveries, analytics, system health (dead-job retry), AI health, audit log, roles and configuration.
- **Platform:** durable job worker (email notifications, daily expiry), security headers, audit trail, sample data clearly labelled.

## Blocked
- **Live AI Tathastu sign-in:** needs AI Tathastu to register Avsar's own OAuth client (staging and production redirect URIs) and confirm token claims. Avsar did **not** modify AI Tathastu. Tracked as DECISIONS D-04.

## Not yet built
- **Infrastructure:** production object storage (S3 implementation of the storage adapter), email provider configuration, edge rate limiting, error monitoring, CI pipeline, staging and production infrastructure.
- **Employer Studio (Release 6):** schema and gate only.
- **Resume intelligence and AI features (Release 7):** none yet.
- **Ecosystem categories (Release 8):** scholarships etc., institutions, monetization, Collaborate integration.
- **Smaller gaps:** dedicated education filter in search; cursor pagination in admin lists; organization suspension and account restriction actions; appeals workflow.

## Legal and founder items
Final Privacy and Terms text, DPDP compliance review, retention periods, grievance officer, under-18 policy.

## 2026-11-06: master correction, phases 0–2
- Removed the 16-step onboarding (see REMOVAL_AUDIT.md); migrations 0001–0003 are forward-only.
- AI Tathastu profile import with provenance and field ownership (see AI_TATHASTU_INTEGRATION.md).
- Dashboard: sync status + Recommended for You; profile page shows the source of each record.
- Verified: tsc clean, eslint clean, vitest 48/48, next build OK. Phase-by-phase status: IMPLEMENTATION_STATUS.md.

