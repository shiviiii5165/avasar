# API contract

Mutations use **server actions** (`src/app/actions/*`). Each one authenticates from the session cookie, validates with zod, authorizes server-side and returns `{ ok, message?, errors? }`. Next.js applies its origin check to server actions.

## Route handlers
| Method & path | Auth | Purpose | Errors |
|---|---|---|---|
| `GET /api/auth/login?returnTo=` | — | Start AI Tathastu sign-in (PKCE); same-site `returnTo` only | → `/sign-in?error=sso_not_configured\|unavailable` |
| `GET /api/auth/callback` | — | Finish sign-in, set session cookie | → `/sign-in?error=invalid_state\|provider_error\|token_invalid\|provider_unavailable\|account_disabled` |
| `POST /api/auth/logout` | cookie | Revoke session (same origin) | 403 `CSRF` |
| `POST /api/auth/dev` | — | Dev personas; 404 unless `AVSAR_DEV_AUTH=1` outside production (also blocked in `proxy.ts`) | 404, 403 |
| `GET /api/documents/:id?exp&sig` | cookie + signature | Private document for its owner or `candidate.view` staff; 5-minute per-viewer link | 401, 403 `LINK_EXPIRED`, 404 |
| `GET /api/me/export` | cookie | JSON export of the caller's data | 401 |

Error shape: `{ "error": { "code": "...", "message": "..." } }`.

## Server actions

**Candidate:**
- Saving and reporting: `toggleSaveAction`, `reportAction` (10 per hour), `supportAction`
- Profile: `saveProfileFieldsAction`, `saveSkillsAction`, `addSectionAction`, `removeSectionAction`, `setSkillLevelAction`
- Resumes: `uploadResumeAction`, `deleteResumeAction`, `defaultResumeAction`
- Applications: `applyAction` (idempotency key), `withdrawAction`
- Saved searches: `saveSearchAction`, `deleteSavedSearchAction`
- Notifications: `markNotificationsReadAction`, `notificationPrefsAction`
- Account: `deleteAccountAction`

**Admin** (permission in brackets):
- `saveOpportunityAction` [opportunity.create]
- `transitionAction` [create, review, publish or suspend, depending on the target status]
- `importAction` [import.review]
- `addSourceAction`, `toggleSourceAction`, `retryJobAction` [source.manage]
- `resolveCaseAction` [report.moderate]
- `applicationStatusAction` [application.update_status]
- `verificationDecisionAction` [organization.verify]
- `ticketStatusAction` [support.handle]
- `grantRoleAction` [role.grant]

## Limits
- **Search:** 12 per page.
- **Admin lists:** 100–200 rows (cursor pagination is a follow-up).
- **Uploads:** 5 MB, 5 resumes per person.
- **Imports:** 500 items per batch.
- **Reports:** 10 per hour.

## Expected from AI Tathastu (Avsar does not modify it)
- `GET {base}/integrations/authorize`
- `POST {base}/api/integrations/sso/token`, returning `id_token` or `access_token` as a JWT with `iss`, `aud` = Avsar client id, `sub`, `exp`, and optional `email`, `email_verified`, `name`, `nonce`
- `GET {base}/api/integrations/jwks`

All are overridable through `AVSAR_AIT_*`.
