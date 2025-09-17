-- Enable Row Level Security and create policies scoping by orgId

ALTER TABLE IF EXISTS children ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS doc_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS iep_extract ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS eobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS next_best_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS glossaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS child_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS job_runs ENABLE ROW LEVEL SECURITY;

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
-- Strict policies (transitional: allow when current_org_id() is NULL for dev)
-- Children: strict
DROP POLICY IF EXISTS rls_children ON children;
CREATE POLICY rls_children ON children
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Helper to (re)create org-scoped policy for a table that has org_id
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'documents','doc_spans','iep_extract','deadlines','letters','claims','eobs',
    'next_best_steps','notifications','agent_runs','glossaries','share_links','child_profile',
    'events','org_settings','org_members','invites','job_runs'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_%I ON %I', t, t);
    -- Transitional policy: if current_org_id() is NULL, allow (dev); else enforce equality
    EXECUTE format(
      $$CREATE POLICY rls_%1$I ON %1$I
         USING ( current_org_id() IS NULL OR org_id = current_org_id() )
         WITH CHECK ( current_org_id() IS NULL OR org_id = current_org_id() )$$,
      t
    );
  END LOOP;
END$$;
