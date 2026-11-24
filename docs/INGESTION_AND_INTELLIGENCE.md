# Opportunity ingestion, verification and career intelligence

Migration `0011_intelligence_layer` (additive only). Code: `src/server/ingestion/`, `src/server/intelligence/`,
`src/server/services/{ingestion,verification,career,skill-registry}.ts`, `src/server/domain/verification.ts`.

## 1. Sources

| Source | Adapter | Authority | Access method | Default status |
|---|---|---|---|---|
| AICTE National Internship Portal | `aicte_internship` | official | authorized feed (partner JSON or approved Apify dataset) | unreviewed, off |
| National Career Service | `ncs` | official | authorized feed | unreviewed, off |
| NATS 2.0 | `nats` | official | authorized feed (apprenticeships only) | unreviewed, off |
| Employer careers site | `employer_careers:<host>` | employer | schema.org `JobPosting` JSON-LD on one page, robots.txt checked | unreviewed, off |
| Naukri.com | `naukri` | third-party | **link-only** (no `collect()`; cannot be approved for collection) | unreviewed, off |

No public, documented bulk API was verified for AICTE, NCS or NATS, so their adapters read an *authorized* feed in
the Avsar feed format (`rawListingSchema` in `ingestion/normalize.ts`). The mapping from a portal's own export to
that format is written once the data-sharing arrangement documents it. Nothing guesses at private endpoints.

A source collects only when **all** of these hold, re-checked on every run (`runIngestion`):
1. a person recorded `approved_collection` with written evidence (`setSourcePermission`, audited, `verification_events`);
2. the source is switched on;
3. its configuration is complete (`missingConfig`);
4. the adapter has a collection method (link-only sources never do).

Not implemented, on purpose: login automation, CAPTCHA solving, proxy rotation, stealth browsers. Playwright is not
added: no source is currently permitted for browser-based extraction. Cheerio is not added: JSON-LD extraction needs
no HTML parser.

### Configuration (names only; values live in the host's secret store)
`AVSAR_SRC_<AICTE|NCS|NATS>_FEED_URL`, `AVSAR_SRC_<…>_FEED_TOKEN` (secret), `AVSAR_SRC_<…>_APIFY_DATASET`,
`AVSAR_APIFY_TOKEN` (secret). Tokens are sent in an `Authorization` header, never in a URL.

### Outbound requests (`ingestion/safe-fetch.ts`)
https only, default port, exact host allow-list per adapter, no IP literals or URL credentials, DNS resolved and every
address checked against private/loopback/link-local/CGNAT/metadata/multicast/reserved/IPv4-mapped ranges, connection
pinned to the checked address (no rebinding), redirects re-validated hop by hop (max 3), 15 s timeout, 5 MB cap,
per-run request budget and spacing (`boundGetter`). Errors name the host only.

## 2. Pipeline
permission gate → collect → validate + normalize (`normalizeListing`) → deduplicate (`compareListings`) → create or
update → mark missing / stale → record the run (`ingestion_runs`) → source health.

* New listings always land **in review**; ingestion never publishes.
* Unknown stays unknown: pay, deadline, employment type, eligibility are null unless stated. Dates are read only in
  ISO form. Unlabelled skill lists become *preferred*; skills found in the description are stored as
  `text_mentioned` and can never be required (DB check constraint).
* Work mode not stated but a location given → on-site, recorded as an assumption (`details.workModeAssumed`).
* Untrusted text: HTML reduced to plain text, hidden/bidi characters removed, lengths capped, instruction-like
  phrases flagged (`content_flags`). A flagged listing cannot be published until the text is edited clean; a
  published listing whose source text becomes flagged goes back to review.

### Deduplication
Same listing when: same source record, same normalized URL, same content fingerprint, **or** same employer + same
title + compatible location + (description similarity ≥ 0.6 or same deadline). Titles alone never merge. A duplicate
from another source adds an `opportunity_source_refs` row; only the source that created a listing may change it.

### Stale and expiry policy
* A failed run changes no listing.
* After a successful, complete run, references the source no longer lists get `missing_since`.
* A listing is stale (`stale_since`) when every reference is missing.
* A published listing stale for 14 days (`STALE_EXPIRE_DAYS`), or past its deadline, becomes `expired` with a
  `system_expiry` verification event. Nothing is deleted; versions, references and events are kept.

## 3. Verification
States — opportunity: `unverified, source_confirmed, employer_confirmed, verified, expired, rejected`; employer: the
existing organization statuses; source: `unreviewed, approved_collection, approved_display, disabled`.
Rules (`domain/verification.ts`): the system may only record `source_confirmed` (authorized official/employer source)
and `expired`. `verified`, `employer_confirmed` and `rejected` need a person and a written evidence description.
The badge column is derived from the state (`badgeLevel`), so no badge exists without its state; "Verified
organization" additionally needs the organization itself verified.

## 4. Career intelligence
* **Registry** (`intelligence/registry-data.ts`, version `avsar-skills/2026-11`): ~75 curated concepts with aliases
  (Indian terms such as Tally, GST, ITI trades kept), parent/child, related and prerequisite links, 17 target roles.
  No ESCO/O*NET URI is typed by hand; `importTaxonomy()` imports a real taxonomy file with its URIs and version.
* **Evidence** (`intelligence/evidence.ts`): every item keeps type, source, time, verification and result. Skill
  state by written rules: verified > demonstrated > practiced > learning > declared. Asking about a topic is
  *learning* at most. Improvement is reported only from two comparable assessment results.
* **Matching** (`intelligence/career-match.ts`, `career-match/v1`): A eligibility (unknown ≠ fail; fail = excluded)
  → B skill fit via registry (exact, specialization, labelled *related*) → C development (in progress / realistic
  next step / gap) → D stated preferences → E documented weights. A listing that names skills is unscored until
  skill fit is assessable. Inputs carry no institution, gender, caste, religion, disability, health or age.
* **Student control**: `/app/career` lets the student exclude evidence types or individual AI Tathastu events.

## 5. Evaluation
`npm run eval:matching` (synthetic, hand-labelled; `intelligence/eval/`). Result at `career-match/v1`, K = 3:

| Metric | career-match/v1 | lexical baseline |
|---|---|---|
| NDCG@3 | 0.950 | 0.920 |
| Precision@3 | 0.538 | 0.538 |
| Recall@3 | 0.859 | 0.885 |
| Closed listings recommended | 0 | 2 |
| Ineligible listing recommended | 0 | 1 |
| Employer diversity in top 3 | 0.976 | 0.833 |

Also: explanation fidelity 1.0; institution twins rank identically; skill extraction precision 1.0 / recall 0.938;
duplicate detection 7/7 pairs; ~1 ms per student. These describe behaviour on 14 synthetic students and 16 synthetic
listings written for this purpose. They are **not** evidence of placement success, and the recall difference shows
the new ranking is not better on every measure. No ML ranker is introduced; any future one must beat this baseline
on held-out, time-split data first.

## 6. Source coverage (2026-11-24)

Verified live on 2026-11-24 (robots.txt, sitemaps, page structure):

| Source | How Avsar uses it | Why |
|---|---|---|
| **Employer job boards** (Greenhouse, Lever, Ashby) | **Automated**: one request per board to the platform's public job-board API, India-located (or remote + India) openings only | These APIs exist for employers to syndicate their own jobs. 14 boards pre-registered (unreviewed, off). |
| Employer careers pages | Automated: schema.org JobPosting JSON-LD, robots.txt checked | For employers not on the platforms above. |
| AICTE Internship Portal | **Links only** (search links by keyword, remote) + authorized-feed adapter | Listing pages carry no listing data in the HTML; listings load from `/api/`, which AICTE's robots.txt disallows. |
| National Career Service | Links only + authorized-feed adapter | Single-page app loading listings from internal APIs; no public feed found. |
| NATS 2.0 | Links only + authorized-feed adapter | Vacancies are visible only after student login. |
| Naukri | Links only (keyword search) | robots.txt itself answers 403 to bots; no partner access. Never collected. |
| Manual / partner sources | Import only (JSON or CSV in Import Review) | |

Students see official-portal search links on `/opportunities` and `/app/career`, clearly marked as external and not
checked by Avsar. A portal becomes automated the moment its owner provides a feed (`AVSAR_SRC_<…>_FEED_URL`).

### Live results (no production database touched)
* `npm run sources:smoke`: 14 boards, **540 India-relevant records, 539 valid**.
* `npm run sources:e2e` (throwaway in-memory DB, two passes): pass 1 created **536** listings (520 jobs, 15
  internships, 1 apprenticeship), merged 3 duplicates, rejected 1 (description under 40 characters); pass 2 created
  **0** (no duplicates on repeat runs). 3 listings were flagged by the injection heuristics; all 3 were false
  positives, which led to narrower patterns (now covered by regression tests).

### Scheduling (no paid service)
`GET /api/cron/ingest`, called by Vercel Cron daily at 02:00 IST (`vercel.json`). Requires `CRON_SECRET` (32+
characters; 503 without it, 401 for anything else). Sources are leased one at a time (`claimDueSource`, row lock +
30-minute lease, so overlapping invocations never run the same source); the pass stops at a 40 s budget inside a
60 s function, and a source cut short is recorded `partial`, marks nothing missing, and continues next pass. Then
stale and past-deadline listings expire. "Run now" in Source Manager runs the same bounded pass inline. The
`npm run worker` path still works when a paid always-on host is added later.

### Publication
Collected listings always enter review. "Approve & publish N in review" (Source Manager, `opportunity.publish`)
publishes only listings passing every check (https links, no flagged text, deadline not passed); each goes through
the normal workflow and audit log.
