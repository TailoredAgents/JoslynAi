# Phased Plan: Local Parity → Render Launch

This plan sequences the required changes to achieve local parity and a safe Render deployment.

## Phase 1 — Local Parity (Compose)

Goals
- Web proxies API requests inside Docker network.
- Worker can reach API with shared internal key.

Tasks
- Fix compose web env block (done):
  - `docker-compose.yml: web.environment`
    - `NEXT_PUBLIC_API_BASE_URL: /api/joslyn`
    - `JOSLYN_API_ORIGIN: http://api:8080`
- Start stack and smoke test:
  - `make up`
  - `curl http://localhost:8080/health` → `{ ok: true }`
  - `curl http://localhost:9090/health` → `{ ok: true }`

Acceptance
- Web UI at `http://localhost:3000` loads and calls `/api/joslyn/*` successfully.

## Phase 2 — Render Blueprint Wiring

Goals
- Correct envs on Web/API/Worker with dynamic URLs set post-deploy.

Tasks
- Web (updated):
  - `NEXT_PUBLIC_API_BASE_URL = /api/joslyn`
  - `JOSLYN_API_ORIGIN = https://<api-host>` (after first deploy)
  - `NEXTAUTH_SECRET` (generated)
- API (updated):
  - `PUBLIC_BASE_URL = https://<web-host>` (after first deploy)
  - `INTERNAL_API_KEY` (manual secret, shared with Worker)
- Worker (updated):
  - `API_URL = https://<api-host>` (after first deploy)
  - `INTERNAL_API_KEY` (same as API)
- Provide S3 and SMTP credentials on API and Worker.
- Verify Render Postgres supports `pgcrypto`, `pg_trgm`, `vector`.

Acceptance
- Web → API server proxy works (no localhost fallbacks).
- Share links/QRs use the web hostname.
- Worker internal ingestion (`x-internal-key`) authorized (no 401).

## Phase 3 — Validation

Goals
- Type-safety and builds validated; DB migrations run in target DB.

Tasks
- Typecheck/build:
  - `corepack pnpm -r typecheck`
  - `corepack pnpm -r build` (if building locally on Windows causes UTF-8 issues, use Docker or CI build)
- DB migrate (against intended DB):
  - `pnpm --filter @joslyn-ai/db migrate`
- E2E tests (with OPENAI_API_KEY):
  - `pnpm dlx playwright install`
  - `pnpm dlx playwright test -c e2e`

Acceptance
- Typecheck passes.
- DB schema, extensions, and RLS installed.
- Key E2E suites pass (onboarding, multitenant, doc URLs, letters).

## Phase 4 — Production Readiness

Goals
- Secure secrets, observability, and operational checks.

Tasks
- Secrets in Render: `NEXTAUTH_SECRET`, `JWT_SECRET`, `ADMIN_API_KEY`, `INTERNAL_API_KEY`, `OPENAI_API_KEY`, SMTP creds.
- Monitoring/health checks:
  - Web `/` (200), API `/health` (200), Worker `/health` (200 via internal health).
- Worker metrics scrape: configure dashboards/alerts for `http://<worker-host>:9090/metrics` (retry spikes, latency, queue depth).
- Schedule retention jobs:
  - `make dead-letter-trim` (with `REDIS_URL`) via cron/Render to keep `jobs:dead` bounded.
  - Database purge (`pnpm --filter @joslyn-ai/db exec prisma db execute --file scripts/purge_ephemeral.sql`).
- Incident runbooks for S3/SMTP outage fallbacks.

Acceptance
- All services healthy; secrets stored; alarms/alerts configured.

## References
- Render credentials & post‑deploy wiring: `docs/RENDER_CREDENTIALS.md`
- Compose and Dockerfiles: `docker-compose.yml`, `infra/docker/*`
- Proxy route: `apps/web/app/api/joslyn/[...path]/route.ts`
- Internal auth: `services/api/src/routes/internal/eob.ts`
