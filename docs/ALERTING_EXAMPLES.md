# Alerting Examples

## Prometheus Recording & Alert Rules

```yaml
# scrape /internal/metrics/prometheus every 60s
scrape_configs:
  - job_name: joslyn-api
    metrics_path: /internal/metrics/prometheus
    scheme: https
    authorization:
      type: Bearer
      credentials: ${INTERNAL_API_KEY}
    static_configs:
      - targets: ["api.example.com"]

rule_files:
  - joslyn-rules.yml
```

`joslyn-rules.yml`:
```yaml
groups:
  - name: queue-health
    rules:
      - record: joslyn:queue_depth:avg5m
        expr: avg_over_time(joslyn_queue_depth[5m])

      - alert: JoslynQueueBacklog
        expr: joslyn:queue_depth:avg5m{queue="jobs"} > 50
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Joslyn ingestion backlog is growing"
          description: |
            jobs queue averaged {{ $value | humanize }} items over the past 10 minutes.
            Inspect worker logs and Redis.

      - alert: JoslynDeadLetterAccumulating
        expr: increase(joslyn_queue_depth{queue="jobs:dead"}[10m]) > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Joslyn dead-letter queue received new jobs"
          description: |
            Dead-letter queue grew in the last 10 minutes. Run `pnpm webhooks:reconcile` or
            inspect jobs via `/internal/metrics/queues`.

  - name: webhook-health
    rules:
      - record: joslyn:webhook_failures:rate5m
        expr: rate(joslyn_webhook_events_total{outcome="failure"}[5m])

      - alert: JoslynWebhookFailuresSpiking
        expr: joslyn:webhook_failures:rate5m > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Stripe webhook failures detected"
          description: |
            Webhook failure rate averaged {{ $value | humanizePercentage }} over 5 minutes.
            Check `webhook_failures` table and reconcile after resolving the root cause.
```
```

## Grafana Dashboard Panel Snippets

Stripe webhook failure rate panel (Time series):
```json
{
  "datasource": { "type": "prometheus", "uid": "PROM_DS" },
  "fieldConfig": {
    "defaults": {
      "unit": "none/min",
      "thresholds": { "mode": "absolute", "steps": [{"color": "green"}, {"color": "red", "value": 0.01}] }
    },
    "overrides": []
  },
  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
  "id": 1,
  "options": {
    "legend": { "displayMode": "table", "placement": "right" },
    "tooltip": { "mode": "multi" }
  },
  "targets": [
    {
      "expr": "rate(joslyn_webhook_events_total{outcome=\"failure\"}[5m])",
      "legendFormat": "{{event}}"
    }
  ],
  "title": "Webhook Failure Rate",
  "type": "timeseries"
}
```

Queue backlog panel (Stat):
```json
{
  "datasource": { "type": "prometheus", "uid": "PROM_DS" },
  "fieldConfig": {
    "defaults": {
      "mappings": [],
      "thresholds": { "mode": "absolute", "steps": [{"color": "green"}, {"color": "yellow", "value": 20}, {"color": "red", "value": 50}] }
    },
    "overrides": []
  },
  "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 },
  "id": 2,
  "options": {
    "colorMode": "continuous",
    "graphMode": "none",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "" },
    "textMode": "value"
  },
  "targets": [
    {
      "expr": "joslyn_queue_depth{queue=\"jobs\"}",
      "legendFormat": "jobs"
    }
  ],
  "title": "Jobs Queue Depth",
  "type": "stat"
}
```

## Render Cron Example

Automatically reconcile webhook failures every hour:
```yaml
cronJobs:
  - name: joslyn-webhook-reconcile
    schedule: "0 * * * *"
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
      - key: INTERNAL_API_KEY
        sync: false
    command: |
      cd /app
      pnpm install --frozen-lockfile
      pnpm webhooks:reconcile
```
(Ensure DATABASE_URL and Prisma migrations are available in the job environment.)
