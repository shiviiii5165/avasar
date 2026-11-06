# Avsar product requirements and traceability

**Avsar — Every Dream Deserves a Chance. One Place. Equal Opportunity.**

The MVP is for students, freshers and early-career candidates in India. It covers jobs, internships and freelance gigs. Candidates use it for free. Listings are published by admins (no AI auto-publishing), and sign-in is AI Tathastu SSO.

## Traceability matrix

Status key:
- **Done:** implemented and tested.
- **Partial:** core implemented, named parts outstanding.
- **Foundation:** model or gate only.
- **Planned:** a later release.
- **Blocked:** waiting on an external dependency.

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| A1 | Landing composition + animated doorway + reduced motion | Done | `(public)/page.tsx`, `brand/doorway.tsx` | E2E 1–3, screenshots |
| A2 | All public pages (About … Terms) | Done | `src/app/(public)` | build, E2E |
| A3 | Only published listings public/indexed; samples noindex | Done | `publicVisibility()` | services tests |
| B1 | SSO adapter: PKCE S256, state, nonce, iss/aud/signature/exp, JWKS | Done | `auth/tathastu.ts` | `tathastu.test.ts` |
| B2 | Own sessions, secure cookies, logout, revocation | Done | `auth/identity.ts` | services tests, E2E |
| B3 | No auto-link by email | Done | `upsertIdentity` | services test |
| B4 | Real Avsar client registered at AI Tathastu | **Blocked** | AI Tathastu change | DECISIONS D-04 |
| C1 | 16-step progressive onboarding, skippable | Done | `app/onboarding` | E2E |
| D1 | Talent profile incl. skill levels + evidence, links, preferences | Done | `services/profiles.ts` | tests, E2E |
| D2 | Visibility private/application/discoverable, private default | Done | schema, Settings | E2E |
| E1 | Resumes: PDF/DOCX, content validation, 5 MB, versions, default, delete, signed links, access log | Done (local storage) | `services/documents.ts` | tests, E2E |
| E2 | Resume parsing with confirmation | Planned R7 | — | — |
| F1 | Structured listings, category details, versions | Done | schema | tests |
| F2 | Search filters, sorting, pagination | Done (education filter via eligibility only) | `searchOpportunities` | tests, E2E |
| F3 | Saved, saved searches, recently viewed, similar | Done | `services/engagement.ts` | tests, E2E |
| G1 | Import → normalize → dedupe → validate → review; provenance; never auto-publish | Done (JSON batch) | `importBatch` | tests |
| G2 | Scheduled feeds/APIs | Planned | Source Manager records terms | — |
| H1 | Eligibility separate; five outcomes; missing ≠ fail | Done | `domain/eligibility.ts` | domain tests |
| I1 | Deterministic explained matching, configurable weights, completeness + evidence | Done | `domain/matching.ts` | domain tests |
| J1 | Dashboard "next useful action" | Done | `app/page.tsx` | E2E |
| K1 | Internal applications with integrity guarantees | Done | `services/applications.ts` | tests, E2E |
| K2 | External applications never shown as tracked | Done | details, `EXTERNAL` error | test |
| K3 | Status machine with history | Done | `domain/workflows.ts` | tests, E2E |
| L1/M1 | Employer Studio and recruitment workspace | Foundation (gated) | schema, `/employer` | — |
| N1/N2 | Admin Studio (16 sections), 6 roles, backend least privilege, audit | Done | `src/app/admin` | tests, E2E |
| O1 | Reports, severity, case actions, audit | Done | `services/trust.ts` | tests, E2E |
| O2 | Organization suspension, account restriction, appeals | Partial | statuses modelled | — |
| P1 | In-app + email, preferences, dedupe, retries | Done (webhook email adapter) | notifications, jobs | tests |
| Q1 | Career insights grounded in data | Partial (skill gaps, evidence) | `app/insights` | — |
| R1 | Metrics with definitions, samples excluded | Done | `METRIC_DEFINITIONS` | Admin Analytics |
| S–U | Monetization, institutions, Collaborate | Planned | no shared data | — |

## Metric definitions
- **Active candidates:** profiles whose identity signed in during the last 30 days.
- **Published opportunities:** non-sample listings that are published and whose deadline hasn't passed.
- **Applications:** applications to non-sample listings.
- **Successful outcomes:** applications with status Selected. An application on its own is never counted as an outcome.
- **Open reports:** cases that are open or escalated.
- **Moderation turnaround:** median hours from case creation to resolution, over the last 30 days.
- **Verified organizations:** organizations with status Verified.

Employer funnel, retention and liquidity metrics wait for Employer Studio and real data.
