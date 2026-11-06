# Removal audit: 16-step onboarding

Date: 2026-11-06. Status: **removed and verified** (typecheck, lint, 48 unit/integration tests, production build).

## What was removed
| Item | Action |
|---|---|
| `src/app/app/onboarding/page.tsx` (route `/app/onboarding`) | Deleted. The route now 404s; nothing links to it. |
| `src/server/domain/completeness.ts` (completion score / "next step") | Deleted, with its unit test. |
| `startOnboardingAction`, `completeOnboardingAction` | Deleted from `src/app/actions/candidate.ts`. |
| `next` step argument on `saveProfileFieldsAction` / `saveSkillsAction` | Removed; callers updated (profile, settings). |
| Redirect to onboarding in `requireCandidate` and the profile page | Removed. A missing profile is now created silently (`ensureProfile`). |
| `SessionContext.onboarded` | Removed. |
| Dashboard completeness card | Replaced by the AI Tathastu sync status card and "Recommended for You". |
| Insights page links to `/app/onboarding?step=N` | Now link to `/app/profile`. |
| Admin candidate list "Onboarded" column | Replaced by "Profile import" (sync status). |
| Columns `candidate_profiles.onboarding_step`, `onboarding_completed_at` | Dropped by forward migration `0002_remove_onboarding.sql`. `0000_init.sql` is untouched (no history rewrite). |

## Candidate data
No candidate data is lost. The two dropped columns held only flow progress (a step number and a timestamp); every
profile field the steps collected lives in its own columns or tables and is untouched. Existing users are never redirected:
the only gate was the removed code.

## Not changed
`completeness` in `src/server/domain/matching.ts` is a different concept (share of match factors that could be assessed)
and is kept. Mentions of "onboarding" for Employer Studio organizations refer to a future feature.
