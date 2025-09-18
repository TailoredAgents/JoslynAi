-- Enable Row Level Security and create policies scoping by orgId

ALTER TABLE IF EXISTS children ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS doc_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS iep_extract ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS iep_diffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS denial_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS goal_rewrites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS advocacy_outlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS research_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appeal_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appeal_kit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS one_pagers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS safety_phrases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS copilot_conversations ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE IF EXISTS entitlements ENABLE ROW LEVEL SECURITY;

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
    'documents','doc_spans','iep_extract','iep_diffs','recommendations','denial_explanations',
    'goal_rewrites','advocacy_outlines','research_summaries','appeal_kits','appeal_kit_items','one_pagers','copilot_conversations',
    'deadlines','letters','claims','eobs','next_best_steps','notifications','agent_runs','glossaries',
    'share_links','child_profile','events','org_settings','org_members','invites','job_runs','entitlements'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_%I ON %I', t, t);
    -- Strict org policy: enforce equality
    EXECUTE format(
      $$CREATE POLICY rls_%1$I ON %1$I
         USING ( org_id = current_org_id() )
         WITH CHECK ( org_id = current_org_id() )$$,
      t
    );
  END LOOP;
END$$;

-- Safety phrases allow global rows (org_id NULL) for seeded guidance
DROP POLICY IF EXISTS rls_safety_phrases ON safety_phrases;
CREATE POLICY rls_safety_phrases ON safety_phrases
  USING (org_id = current_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = current_org_id());
