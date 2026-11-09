# AI Tathastu integration

The contract below was verified by reading AI Tathastu's source (`src/lib/integrations/*`, `src/app/api/integrations/*`,
`src/app/integrations/authorize/*`). AI Tathastu was not modified. Anything marked **unverified** can only be confirmed
against a running AI Tathastu with Avsar registered.

## Verified contract
| Item | Value |
|---|---|
| Authorize | `GET {base}/integrations/authorize?client_id&redirect_uri&state&code_challenge&code_challenge_method=S256[&prompt=none\|consent]` |
| Redirect URI rule | Exact match against `INTEGRATION_<ID>_REDIRECT_URIS`; if unset, only `{app origin}/api/auth/tathastu/callback` (no query, no fragment; https except localhost) |
| PKCE | Required (S256, 43-char challenge) unless the provider sets `INTEGRATION_<ID>_PKCE_OPTIONAL=1` (Avsar always sends it) |
| state | Echoed back; max 500 characters |
| Token | `POST {base}/api/integrations/sso/token`, form body `grant_type=authorization_code, code, redirect_uri, code_verifier, client_id, client_secret` (or HTTP Basic) |
| Code | Single use, 60 seconds, bound to client, redirect URI and PKCE challenge |
| Token response | `{ access_token, token_type: "Bearer", expires_in: 900, scope: "profile:read", user: {id, email, name} }` — **no id_token, no refresh token, no nonce** |
| Access token | ES256 JWT, header `kid`, `typ: JWT`; claims `iss=https://www.aitathastu.com` (fixed, whatever domain serves it), `aud=<client id>`, `sub=<user id>`, `iat`, `exp` (15 min), `jti`, `scope=profile:read`, `email`, `name`, `sv` |
| JWKS | `GET {base}/api/integrations/jwks`, cacheable 1 hour; retired keys stay published during a rotation |
| Profile | `GET {base}/api/integrations/v1/profile` (Bearer) → `ProfessionalProjectionV1`. 401 `invalid_token` (bad token, user disconnected the app, or sessions revoked); 403 (integration disabled); 429; 503 |
| Unshared sections | `null` **and** listed in `privacy.masked`; `privacy.scopes[section] === false`. A shared but empty section is `[]` |
| Authorize errors | `access_denied` (cancel), `login_required` / `consent_required` (prompt=none), `invalid_request`, `temporarily_unavailable` |
| Token errors | `invalid_client` (401), `invalid_grant` (400), `unsupported_grant_type`, `unauthorized_client` (403), `slow_down` (429), `temporarily_unavailable` (503) |
| Launch | AI Tathastu's dashboard opens `{app origin}/api/auth/tathastu/start` |
| Section scopes | `skills`, `projects`, `experience`, `education`, `achievements` (also `eris`, `activity`, not used by Avsar). The student chooses them on the consent screen; nothing is pre-ticked. Avsar does not send `scope` |

## Avsar's implementation
1. `GET /api/auth/login?returnTo=…[&prompt=none|consent]` (or `/api/auth/tathastu/start`) creates a random state (single use, 10-minute
   expiry) and PKCE verifier stored server-side, sets an HttpOnly `avsar_oauth_state` cookie (SameSite=Lax, path `/api/auth`, Secure in
   production) and redirects to authorize. The return path is sanitized (same-site relative only).
2. `GET /api/auth/tathastu/callback` (alias `/api/auth/callback`) requires the state to match this browser's cookie (login-CSRF
   protection; a mismatched state is burned), consumes the flow once, maps provider errors, exchanges the code server-side, and verifies
   the token: ES256 only, issuer, audience (exactly one, = client id), `exp`/`iat`/`sub` present, `scope=profile:read`. Keys come from a
   cached remote JWKS (10 min; unknown `kid` triggers a refetch at most every 30 s).
3. Identity is keyed by `(provider='ai_tathastu', subject=sub)`, never by email; email is not treated as verified.
4. The profile is fetched once with the token (10 s timeout) and applied; the projection's `identity.id` must equal `sub` and its
   `audience` must equal the client id. A failed import is recorded (`ait_sync_status='failed'`) and sign-in continues.
5. Any previous Avsar session on the browser is revoked, a new one is created (HttpOnly, SameSite=Lax, Secure in production), the state
   cookie is cleared, and the user returns to the sanitized path. Tokens are never stored, logged, placed in URLs or sent to the browser.
6. Logout revokes the session server-side (`POST /api/auth/logout`, same-origin only).

Refresh: `/api/auth/login?prompt=none`. `login_required` / `consent_required` lead to `/app/profile?sync=…` with Reconnect (`prompt=consent`).

## Field ownership and conflicts
- `source='ai_tathastu'` rows are replaced on each sync for sections that are shared. A section is removed only when the contract
  marks it unshared (`null` + `privacy.masked`, or scope `false`). A `null` section without that marker is **unconfirmed**: existing
  imported rows are kept and the student sees a partial-import note.
- `source='avsar'` rows are never touched by a sync; an Avsar skill wins over the same imported skill.
- Identity fields are imported unless the student changed them in Avsar (tracked in `imported_fields`).
- 401 from the profile endpoint (disconnected) keeps imported data and offers Reconnect; nothing is deleted silently.
- Nothing is invented; every sync is audited (`profile.ait_sync`, with withheld and unconfirmed sections).

## Tests
- `src/server/auth/tathastu.test.ts`: PKCE/state request shape; valid login; browser-bound state (login CSRF); unknown, missing,
  replayed and expired state; expired/replayed code (`invalid_grant`); access_denied, login/consent required, provider errors; outages and
  wrong client secret; wrong issuer, audience (incl. multiple), expiry, scope, missing `iat`; unpublished key; forged signature under a
  published `kid`; JWKS rotation (including the 30 s refetch cooldown); logout revocation; open-redirect inputs.
- `src/server/services/profile-sync.test.ts`: idempotent import, Avsar edits win, masked section removed, unconfirmed `null` kept,
  empty shared section, audience and subject mismatch, malformed profile, 401/403/429/503/timeout/invalid body.
- Browser (local mock only): default callback path, PKCE and state cookie; consent denied; callback replayed in another browser;
  token never in URLs, page or storage; partial sharing; disconnect → reconnect with data kept; open redirects; logout.

## Registration checklist for the AI Tathastu administrator
Avsar cannot sign in real students until this is done on AI Tathastu (Avsar does not change AI Tathastu):
1. **Client ID:** add `avsar` to `IntegrationClientId` (`src/db/schema.ts`, text column, no migration) and an `INTEGRATION_CLIENTS`
   entry: name "Avsar", origin `https://<avsar-staging-host>` (production origin later), `requested: ["skills", "projects", "experience", "education", "achievements"]`.
2. **Feature flag:** add `avsar_profile_api` to `src/lib/feature-flags.ts` (and the client → flag map) and enable it for staging.
3. **Callback:** `INTEGRATION_AVSAR_REDIRECT_URIS=https://<avsar-staging-host>/api/auth/tathastu/callback` (exact; add production later).
   If unset, AI Tathastu accepts exactly that path on the registered origin anyway.
4. **PKCE S256:** required; do **not** set `INTEGRATION_AVSAR_PKCE_OPTIONAL`.
5. **Client secret:** generate a long random secret and set `INTEGRATION_AVSAR_CLIENT_SECRET` in AI Tathastu's secret store; give the
   same value to the Avsar operator through a secret manager or a one-time secret link — never chat, email body or git.
6. **Signing key:** `INTEGRATION_JWT_PRIVATE_KEY` must already be configured (it is shared by all integrations).
7. **Optional:** `INTEGRATION_AVSAR_WEBHOOK_URL` / `_WEBHOOK_SECRET` (Avsar does not consume webhooks yet; leave unset).

**Unverified until registration:** live endpoint availability on the staging domain, the consent screen wording for Avsar, real
section filtering, real key rotation timing, and that the deployed AI Tathastu matches the source read here.

## Avsar configuration (Avsar's hosting secret store, staging first)
| Variable | Value |
|---|---|
| `AVSAR_AIT_BASE_URL` | AI Tathastu's base URL for that environment (e.g. `https://www.aitathastu.com`) |
| `AVSAR_AIT_CLIENT_ID` | `avsar` |
| `AVSAR_AIT_CLIENT_SECRET` | the secret from step 5 |
| `AVSAR_PUBLIC_URL` | `https://<avsar-staging-host>` (the callback becomes `{this}/api/auth/tathastu/callback`) |
| `AVSAR_AIT_REDIRECT_URI` | optional; only if it must differ, and then it must exactly match step 3 |
| `AVSAR_AIT_ISSUER` | optional; defaults to `https://www.aitathastu.com` |
| `AVSAR_DEV_AUTH` | unset (ignored in production anyway) |

## Local mock provider (development only)
`npm run mock:ait` serves the same contract on `http://localhost:3401` (labelled MOCK; client origin `http://localhost:3300`;
test controls `/__mock/disconnect|reset|share`). Point Avsar at it with `AVSAR_AIT_BASE_URL=http://localhost:3401`,
`AVSAR_AIT_CLIENT_ID=avsar`, `AVSAR_AIT_CLIENT_SECRET=mock-only-secret`. It is not SSO and must never be configured outside local development.
