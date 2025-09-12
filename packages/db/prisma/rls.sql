-- Enable Row Level Security and create policies scoping by orgId

ALTER TABLE IF EXISTS children ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS doc_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS iep_extract ENABLE ROW LEVEL SECURITY;

-- Expect current_setting('request.jwt.org_id', true) to carry org id context
-- Fallback to current_user if needed.

CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
DECLARE
  v uuid;
BEGIN
  BEGIN
    v := current_setting('request.jwt.org_id', true)::uuid;
  EXCEPTION WHEN others THEN
    v := NULL;
  END;
  RETURN v;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper to apply same policy to many tables
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
    'children','documents','doc_spans','iep_extract')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_%I ON %I', r.tablename, r.tablename);
    -- Scope by org_id if present; otherwise allow all (dev)
    IF r.tablename IN ('children') THEN
      EXECUTE format('CREATE POLICY rls_%I ON %I USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id())', r.tablename, r.tablename);
    ELSE
      -- Join-free policy: allow if related child row matches; for MVP leave permissive
      EXECUTE format('CREATE POLICY rls_%I ON %I USING (true) WITH CHECK (true)', r.tablename, r.tablename);
    END IF;
  END LOOP;
END$$;
