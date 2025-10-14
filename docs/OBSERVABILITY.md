# Observability & Monitoring

## Structured Logging

- **API:** Fastify is configured with Pino JSON logs. Set LOG_LEVEL to tune verbosity and ship stdout to your log aggregator.
- **Worker:** Structured JSON logs are emitted via log_event (queue depth, job start/success/fail) for easy ingestion.
- **Log shipping:** Forward container stdout to Datadog/New Relic/Render Log Streams and filter on event=queue.depth or event=job.failed.

## Metrics Endpoints

- GET `/internal/metrics/queues` (requires `x-internal-key`) returns Redis queue depths, `job_runs` status counts, and aggregated webhook outcome counters.
- GET `/internal/metrics/prometheus` (requires `x-internal-key`) emits the same data in Prometheus exposition format (`joslyn_queue_depth`, `joslyn_job_runs_total`, `joslyn_webhook_events_total`). Point Grafana Agent/Prometheus to this endpoint for dashboards and alerts.
- Worker health: GET `http://<worker-host>:9090/health` (returns `200` with state snapshot; responds `503` with reasons if the runner is stalled, backlogged, or experiencing consecutive failures).
- Worker metrics: GET `http://<worker-host>:9090/metrics` for JSON counters and latency aggregates emitted by the job dispatcher. Sample shape:
  ```json
  {
    "counters": {
      "success": { "build_one_pager": 42 },
      "failure": { "prep_recommendations": 1 },
      "attempts": { "ingest_pdf": 123 },
      "retries": { "ingest_pdf": 6 }
    },
    "latency_seconds": {
      "ingest_pdf": { "count": 10, "p50": 3.2, "max": 6.4 }
    },
    "queue_depths": { "jobs": 5 }
  }
  ```
- API health: GET `/health`.

Scrape the worker metrics endpoint alongside `/internal/metrics/queues` to drive Grafana/Datadog dashboards.

## Alerting Suggestions

1. Queue depth: pages when jobs:dead > 0 or jobs depth > 50 for 5+ minutes.
2. Webhook failures: alert when `joslyn_webhook_events_total{outcome="failure"}` increases over a rolling 10-minute window.
3. Job failures: alert on job.failed events.
4. Service health: uptime checks on API & worker health endpoints.

## Dashboards

- Scrape `/internal/metrics/prometheus` and `http://<worker-host>:9090/metrics` every minute, plotting queue depth, webhook failure counters, retries, and p50/max durations.
- Combine with `/admin/usage` to monitor token/cost trends each week.
- Correlate `job.dead_letter` logs with dead-letter trimming metrics to ensure stuck jobs are triaged.
