# Compliance & Backup Runbook

## Data Subject Requests (DSR)

### Export request

```
curl -H "authorization: Bearer <JWT>" \
  https://<api-host>/me/export \
  -o dsr-export.json
```

- The export route returns child documents, letters, events, and activity associated with the authenticated user/org.
- Provide the JSON to the requesting user within the legally required timeframe.

### Delete request

```
curl -X DELETE -H "authorization: Bearer <JWT>" \
  https://<api-host>/me/delete
```

- Deletes per-user events recorded via `/me/delete` to honor user deletion requests.
- Follow up by purging S3 assets tied to the user/org if the request is a full account removal.

## Periodic Purge of Ephemeral Tables

1. Ensure you have a connection string (`DATABASE_URL`).
2. Run the purge command, optionally overriding the retention window:

```bash
DATABASE_URL=postgres://... \
RETENTION_DAYS=120 \
make purge
```

- The script removes `job_runs`, `notifications`, and `events` older than the specified retention period (90 days by default).
- Schedule via cron or Render cron jobs to keep the tables manageable.

## Backups

- **Postgres:** Configure nightly `pg_dump` or enable managed database snapshots with a retention of at least 30 days.
- **Object storage:** Enable bucket versioning or replicate to a secondary region. Combine with lifecycle rules documented in `docs/RETENTION.md`.
- Store backup access instructions and encryption keys in a secure vault (e.g., 1Password, AWS Secrets Manager).

## Incident Response Checklist

1. Identify affected data (org/user) and trigger DSR delete/export steps.
2. Rotate credentials (`JWT_SECRET`, `API_JWT_SECRET`, `INTERNAL_API_KEY`) if a breach is suspected.
3. Restore the most recent database backup if data loss occurred.
4. Re-ingest documents by re-queuing `ingest_pdf` jobs if necessary.
