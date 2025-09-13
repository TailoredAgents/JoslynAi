IEP Ally — Monorepo

Overview

- An AI assistant for IEP/504 and benefits workflows. Upload PDFs, ask questions with citations, generate briefs, draft/render/send letters, compute deadlines, track claims, and share a bilingual “About My Child” profile.

Tech Stack

- Web: Next.js 15, React 19, Tailwind, NextAuth
- API: Fastify + TypeScript, Prisma, OpenAI SDK, S3 presigner, ioredis, pdfkit, nodemailer
- Worker: Python 3.13 OCR/indexer (Tesseract, PyMuPDF, OpenAI embeddings)
- Data: Postgres 16 + pgvector + tsvector, Redis 7, S3-compatible object storage (MinIO in dev)

Getting Started

- Copy env: `cp .env.example .env` and fill keys (at least `OPENAI_API_KEY`).

Local dev (Docker Compose)

- Quick start with Makefile:
  - `make up` — build and start Postgres, Redis, MinIO, Mailhog, API, Web, Worker
  - `make logs-api` — tail API logs (or `make logs`, `make logs-web`, `make logs-worker`)
  - `make down` — stop everything
- Open Web: http://localhost:3000
- API Health: http://localhost:8080/health
- Mailhog (dev email inbox): http://localhost:8025

Database

- Migrate schema and enable extensions/triggers:
  - `make migrate`
  - or: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/iep_ally pnpm db:migrate`

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
  - Rules — edit timeline rules (jurisdiction, kind, delta_days, description, source)
  - Deadlines — list/filter deadlines
  - Usage — feature metrics and model cost aggregation

Services

- Web (apps/web)
- API (services/api)
- Worker (services/worker)
- DB schema + extensions (packages/db)

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

