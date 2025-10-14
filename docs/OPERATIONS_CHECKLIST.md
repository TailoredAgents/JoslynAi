# Production Operations Checklist

Use this list after every deploy to ensure the Joslyn AI stack stays healthy, cost-conscious, and compliant.

## Secrets & Access

- Store secrets in Render environment variables or Secret Files. Never commit sensitive values.
- Rotate credentials at least quarterly: `NEXTAUTH_SECRET`, `JWT_SECRET`/`API_JWT_SECRET`, `INTERNAL_API_KEY`, `ADMIN_API_KEY`, SMTP credentials, S3 keys.
- Set `API_JWT_SECRET` on both the web and API services (identical value). Deployment now fails fast if either side is missing the key.
- Keep an inventory of who can read/write secrets (Render collaborators, CI runners).
- For shared secrets (`INTERNAL_API_KEY`, `API_JWT_SECRET`), generate once and reuse across API and Worker. Record the source of truth.
- Provision a managed ClamAV endpoint and populate `CLAMAV_HOST`, `CLAMAV_PORT`, and `CLAMAV_FAIL_CLOSED`. The API health gate will block startup if the scanner is unreachable while fail-closed is enabled.
- Production deploys must provide: `REDIS_URL`, `OPENAI_API_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `DATABASE_URL`, `INTERNAL_API_KEY`, and SMTP credentials (`EMAIL_FROM`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` or `EMAIL_SERVER`).

## Monitoring & Alerts

- Uptime checks
  - Web: `GET https://<web-host>/` (expect 200).
  - API: `GET https://<api-host>/health` (expect `{ "ok": true }`).
  - Worker: `GET https://<worker-host>/health` (private service check).
- Metrics scrape
  - API queues: `GET https://<api-host>/internal/metrics/queues` (requires `x-internal-key`).
  - Worker: `GET http://<worker-host>:9090/metrics` for counters, retries, latency, queue depth.
- Alerts
  - Queue depth above threshold (`jobs` backlog, `jobs:dead` > 0).
  - Job failure spikes (`job.failed`, `job.dead_letter` events).
  - Render cron failures (see Scheduled Jobs).
  - Requeued jobs: watch for repeated `job.requeued` events; increase `JOB_VISIBILITY_TIMEOUT_SECONDS` if long-running tasks exceed the default visibility window.
  - Stripe webhook issues: monitor `webhooks.*` counters from `/internal/metrics/queues`. Trigger `pnpm webhooks:reconcile` if failures accrue.

## Scheduled Jobs

Recommended automation using Render Cron or an external scheduler:

| Task | Frequency | Command |
| --- | --- | --- |
| Dead-letter trim | hourly | `REDIS_URL=<redis-url> make dead-letter-trim` |
| Database purge | daily | `DATABASE_URL=<postgres-url> pnpm --filter @joslyn-ai/db exec prisma db execute --file scripts/purge_ephemeral.sql` |
| Metrics snapshot (optional) | hourly | scrape worker `/metrics` and store in monitoring system |
| Stuck job sweep (optional) | every 5m | Built-in visibility requeue handles this; adjust `JOB_VISIBILITY_TIMEOUT_SECONDS` as needed. |
| Webhook reconcile | as needed | `pnpm webhooks:reconcile` (requires DB + Stripe secrets) |

Set `DEAD_LETTER_KEEP` or `JOB_DEAD_LETTER_QUEUE` env vars if you need non-default retention.

## Incident Runbooks

- **S3 outages:** switch `S3_ENDPOINT` to backup bucket or pause uploads; communicate to users via status page.
- **SMTP failures:** set `MAIL_HOST` to fallback provider, or temporarily disable outbound email features.
- **Redis down:** queue ingestion pauses. After recovery, inspect `jobs:dead` for failures and requeue manually.
- **OpenAI rate limits:** throttle `MAX_JOB_RETRIES`, enable backoff adjustments, and inform users of delays.

## Pre-Release Checklist

1. Validate environment variables in Render align with `.env.example`.
2. Confirm `RUN_MIGRATIONS=true` on the API service and that boot logs show `prisma migrate deploy` followed by extension scripts.
3. Verify `JOSLYN_API_ORIGIN` (web) and `API_URL` (worker) reference the HTTPS API hostname-no localhost or HTTP fallbacks.
4. Run `pnpm --filter @joslyn-ai/api test` and `python -m pytest services/worker/tests`.
5. Run `pnpm -r build` and `pnpm -r typecheck` locally or in CI.
6. Confirm health endpoints and `/metrics` respond from staging.
7. Review dashboards (queue depth, retries, latency) for anomalies.
8. Visit `/settings/billing`, run a test checkout, and confirm the Stripe redirect returns successfully.
9. Check API startup logs for `[clamav]` readiness messages; resolve before promoting if the scanner is unreachable.

## Post-Release Checklist

1. Verify Render deploy succeeded on Web/API/Worker.
2. Smoke-test primary flows: upload, ask, letters, admin dashboards.
3. Check monitoring dashboards for elevated retries or errors.
4. Ensure scheduled jobs executed in the last cycle (Render cron logs).
5. Log release notes and any incident follow-ups.
