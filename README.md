IEP Ally — Monorepo Scaffold

Getting Started

- Copy env: `cp .env.example .env` and fill keys.

Local dev (Docker Compose)

- `docker compose up --build` to start Postgres, Redis, API, Web, Worker.
- Open web at http://localhost:3000 and API at http://localhost:8080/health.

Local dev (separate)

- API: `pnpm dev:api` (PORT 8080)
- Web: `pnpm dev:web` (PORT 3000)
- Worker: `python -m services.worker.main`
- Infra: `docker run --name iep-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=iep_ally -p 5432:5432 -d postgres:16`
         `docker run --name iep-redis -p 6379:6379 -d redis:7`

Database

- Migrate schema and enable extensions/RLS:
  `DATABASE_URL=postgres://postgres:postgres@localhost:5432/iep_ally pnpm db:migrate`

Render deploy

- Push to GitHub. In Render, create a new Blueprint using `infra/render.yaml`.
- Set env: `OPENAI_API_KEY`, S3/R2 creds, etc.

Services

- Web (Next.js 15, React 19): basic PWA skeleton with Ask bar calling API.
- API (Fastify + TS): minimal endpoints; stubs for tools and features.
- Worker (Python 3.13): OCR/index/extract skeleton; Redis LIST consumer.
- DB (Postgres 16 + Prisma): core tables, extensions, RLS policies.

Minimal endpoints

- GET /health → `{ ok: true }`
- POST /children/:id/ask → `{ answer: "not found", citations: [] }`

Dockerfiles

- `infra/docker/*.Dockerfile` build web, api, worker. Note: requires a `pnpm-lock.yaml`.

Notes

- Render has no object storage: use AWS S3 or Cloudflare R2.
- Cron/background work: use the private worker service and a scheduler later.

Dev Samples

- `dev_samples/` contains placeholders for demo docs.

Agent Rules (prompts)

- See `packages/core/prompts/*` for system instructions.

