Joslyn AI - Monorepo

Overview

- An AI assistant for IEP/504 and benefits workflows. Upload PDFs, ask questions with citations, generate briefs, draft/render/send letters, compute deadlines, track claims, and share a bilingual “About My Child” profile.

Tech Stack

- Web: Next.js 15, React 19, Tailwind, NextAuth
- API: Fastify + TypeScript, Prisma, OpenAI SDK, S3 presigner, ioredis, pdfkit, nodemailer
- Worker: Python 3.13 OCR/indexer (Tesseract, PyMuPDF, OpenAI embeddings)
- Data: Postgres 16 + pgvector + tsvector, Redis 7, S3-compatible object storage (MinIO in dev)

Getting Started

- Copy env: `cp .env.example .env` and fill keys (at least `OPENAI_API_KEY`).
  - Keep `JWT_SECRET` and `API_JWT_SECRET` identical so the Next.js proxy and API share the same signing key.

Local dev (Docker Compose)

- Quick start with Makefile:
  - `make up` - build and start Postgres, Redis, MinIO, Mailhog, API, Web, Worker
  - `make logs-api` - tail API logs (or `make logs`, `make logs-web`, `make logs-worker`)
  - `make down` - stop everything
- Open Web: http://localhost:3000
- API Health: http://localhost:8080/health
- Mailhog (dev email inbox): http://localhost:8025

Database

- Migrate schema and enable extensions/triggers:
  - `make migrate`
  - or: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/joslyn_ai pnpm db:migrate`

Local dev (without Compose)

- API: `pnpm dev:api` (PORT 8080)
- Web: `pnpm dev:web` (PORT 3000)
- Worker: `python -m services.worker.main`
- You must provide Postgres/Redis/MinIO yourself (see docker-compose.yml for ports and envs).

End-to-end demo

1) `make up` and wait for services to start
2) Visit http://localhost:3000/onboarding
   - Step 1: Create a child
   - Step 2: Click “Use sample” to upload a minimal PDF; watch status
   - Step 3: “Load brief” and “Ask about services & minutes”
   - Step 4: Draft → Render → Send letter; view email in Mailhog (http://localhost:8025)

Admin (dev)

- Set `NEXT_PUBLIC_ADMIN_API_KEY` in `.env` (example provided).
- Admin menu exposes:
  - Rules - edit timeline rules (jurisdiction, kind, delta_days, description, source)
  - Deadlines - list/filter deadlines
  - Usage - feature metrics and model cost aggregation

Services

- Web (apps/web)
- API (services/api)
- Worker (services/worker)
  - Controls: adjust `JOB_MAX_RETRIES`, `JOB_RETRY_BACKOFF_SECONDS`, `JOB_QUEUE_LOG_INTERVAL`, and `JOB_DEAD_LETTER_QUEUE` for retry/backoff logging and dead-letter handling.
- DB schema + extensions (packages/db)
- Mobile preview (apps/mobile) - native shell that points to the full web workspace while mobile features are in design.

Minimal endpoints

- GET /health → `{ ok: true }`
- POST /children/:id/ask → `{ answer, citations }`

Deploy (Render)

- Push to GitHub. In Render, create a new Blueprint with `infra/render.yaml`.
- Provide env vars: `OPENAI_API_KEY`, S3/R2 creds, Stripe (optional), admin/internal keys, etc.

Dev samples

- `dev_samples/` contains placeholders for redacted demo docs.

Prompts & templates

- See `packages/core/prompts/*` and `packages/core/templates/*`.

Telemetry & memory

- Copilot runs are recorded in `agent_runs` with a `feature` tag.
- Conversation excerpts persist per child in `copilot_conversations` for quick follow-ups.
- Admin usage dashboards (`/admin/usage`) surface costs, tokens, and run counts.

## Multi-tenancy

- Requests are org-scoped. In development, the API reads the `x-org-id` header (defaults to `demo-org`). In production, the authenticated user/session determines org.
- Isolation is enforced with strict Postgres Row-Level Security (RLS) using the session GUC `request.jwt.org_id`. Cross-tenant access returns 404 where applicable (e.g., documents, spans, letters, jobs).
- Object storage keys are namespaced by org:
  - Documents: `org/{org_id}/children/{child_id}/...`
  - Letters: `org/{org_id}/letters/{letter_id}.pdf`
  - Profiles: `org/{org_id}/profiles/{child_id}.pdf`
  - Forms: `org/{org_id}/forms/{id}.pdf`
- Worker jobs include `org_id`, and the worker sets the DB session org before reads/writes to respect RLS.

## Testing

- API unit tests: `pnpm --filter @joslyn-ai/api test`
- Worker unit tests: `python -m pytest services/worker/tests`
- End-to-end tests (Playwright) cover onboarding, ask/brief, letters, and negative uploads.
- Run locally (with the stack up and `OPENAI_API_KEY` set):
  - `pnpm dlx playwright install`
  - `pnpm dlx playwright test -c e2e`
  - Or: `npx playwright test -c e2e`
- See `docs/TESTING.md` for detailed guidance and CI recommendations.

## Notable endpoints (dev)

- `GET /health` → `{ ok: true }`
- `POST /children/:id/ask` → `{ answer, citations }`
- `GET /documents/:id/url` (org-scoped)
- `GET /documents/:id/spans?page=N` (org-scoped)
- `POST /tools/letter/draft|render|send` (org/role/entitlement-scoped)

Retention

- See `docs/RETENTION.md` for storage lifecycle, cleanup, and backup guidance.

Observability

- See `docs/OBSERVABILITY.md` for logging, queue metrics, and alerting guidelines.
- See `docs/OPERATIONS_CHECKLIST.md` for production monitoring, cron jobs, and post-release steps.

Compliance

- See `docs/COMPLIANCE.md` for DSR handling, retention purges, and backup/runbook steps.
