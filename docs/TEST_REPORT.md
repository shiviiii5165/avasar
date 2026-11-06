# Test report — 2026-11-06

All runs were local, on synthetic data. No production system was used.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | Pass (0 errors) |
| `eslint src scripts` | Pass (0 errors, 0 warnings) |
| `vitest run` | **43/43 pass** (3 files) |
| `next build` (production) | Pass, no warnings; 50 routes |
| End-to-end browser journeys (Chrome, dev server, fresh DB) | **23/23 steps pass** |

## Unit and integration tests (vitest, in-memory PostgreSQL)

**`domain.test.ts` (22 tests):**
- Skill normalization and parsing.
- Eligibility: pass, hard-fail, missing data treated as unknown, potentially eligible, deadline, internships at half weight, remote ignores location.
- Matching: weights sum to 1, explanations, completeness instead of a penalty, ineligibility never hidden, evidence strength.
- Workflows: no publish without review, publish validation, visibility, application transitions by actor, safe URLs.
- Permissions: least privilege.
- Completeness, and dashboard deadlines.

**`services.test.ts` (14 tests):**
- Identity: no email linking; sessions hashed and revocable.
- Search: filters, pagination, drafts hidden.
- Admin pipeline: validation and audit.
- Import: queue, invalid items and dedupe, never published.
- Applications: idempotent replay, snapshot, event, notification and email job; duplicate, consent, external, answers and closed refusals; status history and candidate-only withdraw.
- Documents: content validation, size limit, per-viewer expiring signatures, delete.
- Moderation: report → critical case → suspend → hidden publicly.
- Saved items, plus job retry, backoff and dead letter.

**`tathastu.test.ts` (7 tests, real ES256 tokens with simulated JWKS and token endpoint):**
- PKCE S256 request with the exact redirect URI.
- Verified identity; replayed state rejected.
- Wrong audience, wrong issuer, expired token and nonce mismatch rejected.
- Provider outage reported as unavailable.
- Unknown state and provider errors rejected; open-redirect protection.

## End-to-end (Chrome)
**Candidate:**
1. Landing with animated doorway; reduced motion shows a still door; mobile at 390px has no overflow.
2. Explore shows 9 sample listings; the internship filter gives 3.
3. Signed out: details show a sign-in gate. Then dev sign-in.
4. Onboarding: basics, stage, education, skills, work modes, authorization, resume upload, finish.
5. A disguised non-PDF upload is refused.
6. Dashboard shows the next action and recommendations.
7. Details show Eligible and a 92% explained match.
8. Save, then it appears in Saved.
9. Apply: consent is enforced server-side, typed input is kept after the error, submission confirmed, duplicate blocked.
10. Notification created. Report filed.
11. Admin Studio refused for the candidate.
12. Candidate pages at 390px have no overflow.

**Admin:**
1. Overview excludes samples.
2. Create → review → approve → publish; the listing becomes public.
3. Critical report case → suspend; the listing disappears publicly.
4. Audit log contains all actions.
5. Status update reaches the candidate's history.
6. Moderator is denied Configuration and creating listings.
7. Logout revokes the session.

Screenshots and redacted results are kept outside the repository (Claude scratchpad, `avsar-e2e-final/`).

## Defects found and fixed during testing
- Deadline counted as eligibility evidence (made empty profiles "potentially eligible").
- System actor transition rule was unreachable.
- Publish check wrongly required a source URL for manually curated listings.
- Tailwind loader was missing after a config rewrite (styles not generated).
- React 19 form reset was wiping input on validation errors.
- `encType` set on function-action forms.
- Status-change confirmations disappeared after re-render.
- PGlite failed on a fresh checkout because the parent `.data` directory didn't exist.
- Account deletion could abort its transaction when applications existed.

## Known issues
- **Hydration warning:** one React "attributes didn't match" warning appears in the combined admin E2E run (dev server). It points at a workflow `ActionForm` on the admin opportunity page. It isn't reproducible in isolated replays of the same flow or on reload. Not yet root-caused.
- **No E2E against a production build:** dev sign-in is (correctly) unavailable there; this needs a staging SSO client.
- **Not run:** load and performance tests, security scanning tools, backup/restore drill. They need staging infrastructure.
