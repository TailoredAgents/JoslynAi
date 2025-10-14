# Render Deployment Credentials & Post‑Deploy Wiring

This guide lists the credentials and environment variables you must provide for Web, API, and Worker services, and explains the post‑deploy steps to wire dynamic URLs in Render (because service URLs aren’t known until the first deploy).

Use this as a checklist when promoting from local to Render.

## Order of Operations (Render)

1) Provision dependencies first
- Create Postgres 16 (Starter or better) and Redis 7 (Starter).
- Confirm Postgres supports extensions: `pgcrypto`, `pg_trgm`, and `pgvector`.

2) Create services from the repo
- API: type "Web", docker build using `infra/docker/api.Dockerfile`.
- Web: type "Web", docker build using `infra/docker/web.Dockerfile`.
- Worker: type "Private Service", docker build using `infra/docker/worker.Dockerfile`.

3) Set initial env vars (secrets and static values) per service (see sections below). For any “dynamic URL” vars, leave them blank for now; you’ll fill them after the first deploy when Render shows the service URLs.

4) First deploy
- Deploy all three services. After they boot, copy their external URLs from Render’s dashboard.

5) Post‑deploy URL wiring
- Web → API: set `JOSLYN_API_ORIGIN` on Web to the API external URL (e.g., `https://iep-ally-api.onrender.com`). Always use HTTPS so proxied browser calls stay on the same origin.
- API → Web: set `PUBLIC_BASE_URL` on API to the Web external URL (e.g., `https://iep-ally-web.onrender.com`).
- Worker → API: set `API_URL` on Worker to the API external URL (HTTPS only). This prevents the worker from falling back to http://localhost.
- Ensure `INTERNAL_API_KEY` is IDENTICAL on API and Worker (choose a strong value once and reuse).
- Save, redeploy Web, API, and Worker.

6) Verify health
- API: `GET https://<api-host>/health` returns `{ ok: true }`.
- Worker: `GET https://<worker-host>/health` (Private; use Render internal URL or dashboard health check).
- Web: Browse the site; API calls should succeed via `/api/joslyn` with org headers added by the proxy.
- Metrics: ensure `http://<worker-host>:9090/metrics` is reachable from your monitoring agent (use Render Private Service connections).
- Cron: set up Render Cron jobs for `make dead-letter-trim` and the database purge (see "Scheduled Jobs" in `docs/OPERATIONS_CHECKLIST.md`).

## Web Service (Next.js)

Required
- `NEXT_PUBLIC_API_BASE_URL` = `/api/joslyn`
  - Do not set this to the API host. It must remain a relative path so the browser goes through the Next.js server route and org headers are injected.
- `JOSLYN_API_ORIGIN` = `https://<api-host>` (set AFTER first deploy)
  - Absolute URL of the API used by the server route at `apps/web/app/api/joslyn/[...path]`.
- `NEXTAUTH_SECRET` = strong random string (e.g., 32+ bytes base64url)
- `API_JWT_SECRET` = strong random string shared exactly with the API service

Optional
- `NEXT_PUBLIC_ADMIN_API_KEY` = if admin UI needs client-side auth gate.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` = enable Google login.

Notes
- Web listens on port 3000; Render health path `/`.
- Keep `NEXT_PUBLIC_API_BASE_URL` as `/api/joslyn` in all environments.

## API Service (Fastify)

Required
- `PORT` = `8080`
- `DATABASE_URL` = from Render Postgres (managed)
- `REDIS_URL` = from Render Redis (managed)
- `OPENAI_API_KEY` = your OpenAI API key
- `OPENAI_MODEL_PRIMARY` = e.g., `gpt-5` (defaults exist)
- `OPENAI_MODEL_MINI` = e.g., `gpt-5-mini` (defaults exist)
- `OPENAI_EMBEDDINGS_MODEL` = e.g., `text-embedding-3-small`
- `S3_ENDPOINT` = your S3/R2 endpoint (e.g., `https://<account>.r2.cloudflarestorage.com`)
- `S3_BUCKET` = bucket name (e.g., `joslyn-ai`)
- `S3_ACCESS_KEY_ID` = access key
- `S3_SECRET_ACCESS_KEY` = secret key
- `JWT_SECRET` (or `API_JWT_SECRET`) = reuse the same value provided to the Web service so proxy-signed JWTs validate
- `RUN_MIGRATIONS` = `true` (default in `render.yaml`) so schema, extensions, and RLS apply automatically at boot
- `ADMIN_API_KEY` = strong random string (Render can generate)
- `INTERNAL_API_KEY` = strong random string SHARED with Worker
- `PUBLIC_BASE_URL` = `https://<web-host>` (set AFTER first deploy)

Recommended (Mail)
- `MAIL_HOST` = SMTP host (e.g., Postmark/SendGrid/SES)
- `MAIL_PORT` = SMTP port (e.g., `587`)
- `MAIL_FROM` = default sender email (e.g., `no-reply@yourdomain.com`)

Optional (Billing)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PRICE_BASIC`, `PRICE_PRO`

Optional (Security)
- `ALLOWED_UPLOAD_EXT`, `ALLOWED_UPLOAD_MIME` = tighten accepted file types (comma-separated).
- `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_TIMEOUT_MS`, `CLAMAV_FAIL_CLOSED` = enable ClamAV scanning (recommended). Leave `CLAMAV_FAIL_CLOSED=1` in production so infected uploads are rejected.

Notes
- API listens on port 8080; health at `/health`.
- The app auto-creates the bucket if missing (MinIO/R2-compatible) via `ensureBucket()`.
- Share links and QR codes use `PUBLIC_BASE_URL`; without it, they default to `http://localhost:8080`.
- Leave `ALLOW_HEADER_AUTH` unset (defaults to disabled) in production; setting it to `1` will now prevent the API from booting.
- If ClamAV is configured, ensure the scanner is reachable from the API service; set `CLAMAV_FAIL_CLOSED=0` only if you prefer to allow uploads when the scanner is offline.

## Worker Service (Python)

Required
- `DATABASE_URL` = from Render Postgres
- `REDIS_URL` = from Render Redis
- `OPENAI_API_KEY` = your OpenAI API key
- `OPENAI_MODEL_PRIMARY` = e.g., `gpt-5`
- `OPENAI_MODEL_MINI` = e.g., `gpt-5-mini`
- `OPENAI_EMBEDDINGS_MODEL` = e.g., `text-embedding-3-small`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` = same as API
- `API_URL` = `https://<api-host>` (set AFTER first deploy). Do not use HTTP.
- `INTERNAL_API_KEY` = EXACTLY the same value as API

Optional
- `RETENTION_DAYS` = e.g., `365`
- `API_JWT_SECRET` (optional) = set if the worker ever needs to validate proxy tokens; match the Web/API value

Notes
- Worker exposes `/health` on port 9090.
- Worker makes internal ingestion calls to the API with header `x-internal-key: INTERNAL_API_KEY`.
- Worker exposes `/metrics` on port 9090 for queue depth, retries, and latency (scrape via internal monitoring or Render Private Service).

## Secrets: How to Choose and Store

- Use a password manager to generate random values (32-64 bytes, base64url) for: `NEXTAUTH_SECRET`, `JWT_SECRET`/`API_JWT_SECRET`, `ADMIN_API_KEY`, `INTERNAL_API_KEY`.
- Document a rotation cadence (at least quarterly) for every shared secret and log the date of the last rotate.
- Store them as Render “Secret Files” or Environment Variables; avoid committing any secrets to the repo.
- For shared secrets (`INTERNAL_API_KEY`), define them once and reference from both API and Worker. Do not use `fromService` for secrets that must be identical across services.

## Postgres Extensions

The migrations expect these extensions:
- `pgcrypto` (UUID, crypto helpers)
- `pg_trgm` (text search trigram)
- `vector` (pgvector for embeddings)

If your Render Postgres plan does not support them, upgrade the plan or disable features that rely on them before deploying.

## Local Development (Parity Notes)

- `.env` example values live in `.env.example`. Copy to `.env` and fill `OPENAI_API_KEY` at minimum.
- `docker-compose.yml` provides MinIO (S3‑compatible), Postgres, Redis, API, Web, Worker, Mailhog.
- Keep Web: `NEXT_PUBLIC_API_BASE_URL=/api/joslyn`, `JOSLYN_API_ORIGIN=http://api:8080`.
- Start stack: `make up`
- Run DB migrations locally: `make migrate`

## Quick Troubleshooting

- 401 on `/internal/*` from Worker: `INTERNAL_API_KEY` mismatch. Set the same key on API and Worker.
- Web calling localhost in Render: set `JOSLYN_API_ORIGIN` on Web to API’s Render URL.
- Share links point at localhost: set `PUBLIC_BASE_URL` on API to Web’s Render URL.
- S3 upload failures: verify `S3_ENDPOINT`, bucket name, and credentials; for R2 use the account endpoint.
- NextAuth errors in production: set `NEXTAUTH_SECRET` on Web.
