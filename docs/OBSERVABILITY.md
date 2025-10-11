# Observability & Monitoring

## Structured Logging

- **API:** Fastify is configured with Pino JSON logs. Set LOG_LEVEL to tune verbosity and ship stdout to your log aggregator.
- **Worker:** Structured JSON logs are emitted via log_event (queue depth, job start/success/fail) for easy ingestion.
- **Log shipping:** Forward container stdout to Datadog/New Relic/Render Log Streams and filter on event=queue.depth or event=job.failed.

## Metrics Endpoints

- GET /internal/metrics/queues (requires x-internal-key) returns Redis queue depths and job_runs status counts.
- Worker health: GET http://<worker-host>:9090/health.
- API health: GET /health.

## Alerting Suggestions

1. Queue depth: pages when jobs:dead > 0 or jobs depth > 50 for 5+ minutes.
2. Job failures: alert on job.failed events.
3. Service health: uptime checks on API & worker health endpoints.

## Dashboards

- Scrape /internal/metrics/queues every minute and chart job_runs.pending vs job_runs.processing in Grafana.
- Combine with /admin/usage to monitor token/cost trends each week.
