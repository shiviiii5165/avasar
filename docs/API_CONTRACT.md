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
- **Uploads:** 4 MB (below Vercel's 4.5 MB request limit), 5 resumes per person.
- **Imports:** 500 items per batch.
- **Reports:** 10 per hour.

## Expected from AI Tathastu (Avsar does not modify it)
- `GET {base}/integrations/authorize`
- `POST {base}/api/integrations/sso/token`, returning `id_token` or `access_token` as a JWT with `iss`, `aud` = Avsar client id, `sub`, `exp`, and optional `email`, `email_verified`, `name`, `nonce`
- `GET {base}/api/integrations/jwks`

All are overridable through `AVSAR_AIT_*`.

## Partner API: AI Tathastu internships (`GET /api/partner/v1/internships`)

For AI Tathastu's dashboard only. Disabled unless `AVSAR_PARTNER_API_AIT=1`.

**Authentication:** `Authorization: Bearer <assertion>`. The assertion is an ES256 JWT signed by AI Tathastu's integration key and verified against the same JWKS as sign-in (`AVSAR_AIT_JWKS_URL` or `AVSAR_AIT_BASE_URL`). No shared secret is involved. Required claims:

| Claim | Value |
|---|---|
| `iss` | `AVSAR_AIT_ISSUER` (default `https://www.aitathastu.com`) |
| `sub` | `ai-tathastu` |
| `aud` | `avsar-partner-api` |
| `scope` | `opportunities:read` |
| `exp`, `iat`, `jti` | present; lifetime at most 300 seconds |

A student's sign-in token is rejected. Call the canonical host (`AVSAR_PUBLIC_URL`): a redirect from another host drops the Authorization header.

**Query parameters:** `page` (1–200, default 1), `pageSize` (1–50, default 25), `workMode` (`remote` | `hybrid` | `onsite`). The rate limit is 120 requests per minute per partner; over the limit the API returns 429 with `retry-after`.

**What it returns:** only `category = internship`, `status = published`, deadline not passed (the marketplace's `publicVisibility` rule), and never sample listings. The order is newest published first, then id, and is stable across pages.

**Response shape:** `{ schema: "PartnerInternshipV1", generatedAt, page, pageSize, total, hasMore, items[] }`. Each item has:
- `id`, `slug`, `title`, `organization`, `summary`, `description`
- `requiredSkills`, `preferredSkills`
- `eligibility`: `{ educationLevels, graduationYearMin/Max, minExperienceYears, requiredCertifications, allowedLocations, requiresWorkAuthorizationIndia, notes }` or null
- `locations`, `country`, `workMode`
- `stipend`: `{ min, max, currency, period, note }` or null; plus `unpaid`, `durationWeeks`, `startDate`
- `publishedAt`, `deadline` (null if none), `updatedAt`
- `status` (always `"published"`), `verification`, `applicationMethod`
- `url`: the Avsar listing page
- `applyUrl`: `/app/apply/{slug}` for Avsar-hosted applications, or the listing page for external ones

Applications are only ever created inside Avsar. This API cannot create or read applications and returns nothing about candidates.

**Errors:** `{ error: { code, message } }` with status 401 `UNAUTHORIZED`, 400 `INVALID_QUERY`, 429 `RATE_LIMITED`, 503 `PARTNER_API_DISABLED`, or 503 `KEYS_UNAVAILABLE`.
