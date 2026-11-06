# Avsar

**Every Dream Deserves a Chance. One Place. Equal Opportunity.**
*AVSAR — Open to what's next.*

Avsar is an independent opportunity-discovery and application platform for students, freshers and early-career candidates. With it, a candidate can:
- discover jobs, internships and gigs;
- understand their eligibility and fit;
- improve, apply, and track every application.

## Quick start
```
npm install
npm run db:seed                 # local embedded database + SAMPLE listings
AVSAR_DEV_AUTH=1 npm run dev    # http://localhost:3000
```
Sign in at `/sign-in` with a development persona: candidate, platform admin or moderator. Real sign-in uses AI Tathastu once Avsar's own OAuth client is registered (see `docs/DECISIONS.md`, D-04).

| Command | Purpose |
|---|---|
| `npm test` | Unit + integration tests (in-memory PostgreSQL) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Quality gates |
| `npm run db:generate` | Create a migration after a schema change |
| `npm run db:migrate` | Apply migrations (`DATABASE_URL` or local) |
| `npm run worker` | Background jobs (email notifications, expiry) |

## Documentation
| Document | Contents |
|---|---|
| [Architecture](docs/AVSAR_ARCHITECTURE.md) | System design and modules |
| [Requirements & traceability](docs/PRODUCT_REQUIREMENTS.md) | Every requirement mapped to code and tests |
| [Data model](docs/DATA_MODEL.md) | Tables, statuses, deletion |
| [API contract](docs/API_CONTRACT.md) | Route handlers and server actions |
| [Security & privacy](docs/SECURITY_PRIVACY.md) | Controls and open items |
| [Roadmap](docs/IMPLEMENTATION_ROADMAP.md) | Releases and next steps |
| [Decisions](docs/DECISIONS.md) | Choices and blockers |
| [Operations](docs/OPERATIONS.md) | Local, staging, deployment, backup, incidents |
| [Progress](docs/PROGRESS.md) | Current status |
| [Test report](docs/TEST_REPORT.md) | Latest results |
