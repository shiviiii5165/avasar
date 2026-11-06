# AI Tathastu integration

The contract below was verified by reading AI Tathastu's source (`src/lib/integrations/*`). AI Tathastu was not modified.

## Flow (implemented)
1. `GET /api/auth/login?returnTo=…[&prompt=none|consent]` → `startFlow` stores state + PKCE verifier server-side and redirects to
   `https://www.aitathastu.com/integrations/authorize?client_id&redirect_uri&state&code_challenge(S256)[&prompt]`.
2. `GET /api/auth/callback` → `completeFlow`: checks state, exchanges the code at `POST /api/integrations/sso/token`, **verifies the
   ES256 access token against AI Tathastu's JWKS** (iss, aud = client id, exp). Unverified payloads are never trusted.
3. Identity is keyed by `(provider='ai_tathastu', subject=sub)`. Email is stored for contact only: it is never the key, and accounts are never linked by email.
4. `ensureProfile` creates the Avsar profile (no onboarding), then `GET /api/integrations/v1/profile` (Bearer, 10 s timeout) is applied by
   `applyTathastuProfile`. If the import fails, the failure is recorded (`ait_sync_status='failed'`) and sign-in still succeeds.
5. The session cookie is HttpOnly. The access token only ever exists in server memory during the callback; it is never stored, put in localStorage, or placed in a URL.
6. The user is redirected to the sanitized `returnTo`.

Refresh: `/api/auth/login?prompt=none` re-runs the flow silently. `login_required` and `consent_required` send the user to `/app/profile?sync=…` with a Reconnect button (`prompt=consent`).

## Field ownership and conflicts
- Section rows with `source='ai_tathastu'` (education, experience, projects, certifications, achievements, skills) are replaced on every sync. Sections the student stops sharing are removed.
- Rows with `source='avsar'` are never touched by a sync. If a skill exists in both, the Avsar row wins.
- Identity fields (name, headline, city, country) are imported unless the student changed them in Avsar (tracked in `imported_fields`); then the student's value wins.
- Nothing is invented: a value that's missing stays unknown, and an education level is derived only from explicit degree text.
- Every sync is audited (`profile.ait_sync`, with the withheld sections).

Tests: `src/server/services/profile-sync.test.ts` covers idempotency, Avsar edits winning, a withdrawn section being removed, and subject mismatch.

## Blocker: AI Tathastu must register an `avsar` client
Real SSO cannot work until AI Tathastu adds Avsar to its hard-coded `INTEGRATION_CLIENTS`. This is a change on AI Tathastu's side, which this work does not make. Change request:
- Add `"avsar"` to the `IntegrationClientId` type and the `INTEGRATION_CLIENTS` map (display name "Avsar", allowed redirect URI `https://<avsar-host>/api/auth/callback`, plus localhost for dev).
- Add `INTEGRATION_AVSAR_CLIENT_SECRET` (and the enable flag) to AI Tathastu's environment, set by the AI Tathastu owner. The secret is shared with Avsar's `TATHASTU_CLIENT_SECRET` through the hosting secret store, never through chat or git.
- Scopes needed: profile:read with the education, skills, projects, experience and achievements sections (the user chooses on the consent screen).

Until then, local development uses the **simulated** dev sign-in (`AVSAR_DEV_AUTH=1`, provider `dev`, labelled as simulated, disabled in production). It is not SSO.

## Local mock provider (development only)
`npx tsx scripts/mock-ait.mts` serves the same contract on `http://localhost:3401` (authorize page labelled MOCK, PKCE-checked token exchange, ES256 JWKS, fixture profile) and refuses to run with `NODE_ENV=production`. Point Avsar at it with `AVSAR_AIT_BASE_URL=http://localhost:3401`, `AVSAR_AIT_CLIENT_ID=avsar`, `AVSAR_AIT_CLIENT_SECRET=mock-only-secret`. It is not SSO and must never be configured outside local development.
