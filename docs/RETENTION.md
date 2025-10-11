# Data Retention & Cleanup Strategy

This checklist outlines how to keep Joslyn AI storage tidy and compliant once documents begin to accumulate.

## Object Storage (S3/R2/MinIO)

- **Lifecycle rule:** apply a bucket lifecycle policy that expires files under `org/*/children/*` that are older than your contractual retention window (e.g., 365 days).
- **Generated artifacts:** letters, one pagers, profiles, and appeal kits live under `org/*/letters`, `org/*/profiles`, etc. Use the same lifecycle rule or a shorter TTL (90 days) when the artifact can be re-generated.
- **Versioning:** disable object versioning or periodically purge old versions to avoid duplicate storage costs.

## Database

- `job_runs`, `notifications`, and `events` grow quickly. Schedule a weekly task (Cron/Docker) that runs:
  ```bash
  pnpm --filter @joslyn-ai/db exec prisma db execute --file scripts/purge_ephemeral.sql
  ```
  The script should delete rows older than the retention threshold while respecting org_id filters.
- For `iep_extract`, `denial_explanations`, and `goal_rewrites`, keep only the latest record per document or mark older rows with a `status='archived'` flag so they can be safely pruned later.

## Redis / Queue

- Configure Redis with an `allkeys-lru` policy or set key-specific TTLs for transient data (`jobs`, cache entries).
- The worker pushes permanently failed jobs to the `jobs:dead` list. Monitor and trim this list (e.g., keep only the most recent 1,000 entries). Use the helper:
  ```bash
  REDIS_URL=redis://localhost:6379/0 make dead-letter-trim
  ```
  Optional flags (`DEAD_LETTER_KEEP`, `JOB_DEAD_LETTER_QUEUE`, `--dry-run`) make it easy to schedule via cron or Render jobs.

## Backups

- Nightly Postgres snapshot (managed DB or `pg_dump`) retained for 30 days.
- Weekly S3 bucket backup or cross-region replication if regulatory requirements mandate it.

## Operational Checklist

1. **Enable lifecycle rules** in the object store as soon as a production bucket is created.
2. **Deploy the cleanup script** with the same release that enables lifecycle policies.
3. **Monitor queue failures** in `jobs:dead`; investigate recurring payloads and delete entries after resolution.
4. **Review retention policies quarterly** to ensure they still match customer contracts or regional regulations.
