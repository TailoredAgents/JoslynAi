-- Enable Row Level Security and create policies scoping by orgId

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Child" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocSpan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IepExtract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deadline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Letter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Share" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Provider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Claim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Eob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AskQuery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AskAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChildProfile" ENABLE ROW LEVEL SECURITY;

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
    'User','Child','Document','DocSpan','IepExtract','Deadline','Letter','Meeting','Task','Share','Policy','Provider','Claim','Eob','Application','AskQuery','AskAnswer','ChildProfile')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_%I ON "%I"', r.tablename, r.tablename);
    EXECUTE format('CREATE POLICY rls_%I ON "%I" USING (orgId = current_org_id()) WITH CHECK (orgId = current_org_id())', r.tablename, r.tablename);
  END LOOP;
END$$;

