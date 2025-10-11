-- Delete ephemeral records older than the configured retention window.
-- Configure retention days via PGOPTIONS="-c joslyn.retention_days=90" before running.

DO $$
DECLARE
  retention_days integer;
  cutoff_text text;
BEGIN
  BEGIN
    retention_days := current_setting('joslyn.retention_days', true)::integer;
  EXCEPTION
    WHEN others THEN retention_days := 90;
  END;

  cutoff_text := retention_days || ' days';

  RAISE NOTICE 'Purging data older than % days', retention_days;

  EXECUTE format('DELETE FROM job_runs WHERE created_at < now() - interval %L', cutoff_text);
  EXECUTE format('DELETE FROM notifications WHERE created_at < now() - interval %L', cutoff_text);
  EXECUTE format('DELETE FROM events WHERE created_at < now() - interval %L', cutoff_text);
END $$;
