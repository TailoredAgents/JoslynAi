-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- tsvector and vector columns for spans table (snake_case)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'doc_spans' AND column_name = 'tsv'
  ) THEN
    ALTER TABLE doc_spans ADD COLUMN IF NOT EXISTS tsv tsvector;
    CREATE INDEX IF NOT EXISTS docspan_tsv_idx ON doc_spans USING GIN (tsv);
    CREATE INDEX IF NOT EXISTS idx_doc_spans_tsv ON doc_spans USING GIN (tsv);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'doc_spans' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE doc_spans ADD COLUMN IF NOT EXISTS embedding vector(1536);
    -- ivfflat requires setting appropriate lists; ensure pgvector configured in DB
    CREATE INDEX IF NOT EXISTS docspan_embedding_idx ON doc_spans USING ivfflat (embedding vector_cosine_ops);
  END IF;
END$$;

-- Maintain tsv via trigger
CREATE OR REPLACE FUNCTION doc_spans_tsv_update()
RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.text,''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doc_spans_tsv ON doc_spans;
CREATE TRIGGER trg_doc_spans_tsv
BEFORE INSERT OR UPDATE ON doc_spans
FOR EACH ROW EXECUTE FUNCTION doc_spans_tsv_update();

-- Seed baseline timeline rules (idempotent via unique constraint on jurisdiction+kind)
INSERT INTO timeline_rules (id, jurisdiction, kind, delta_days, description, source_url, active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'US-*', 'iep_annual_review', 365, 'Annual IEP review due', NULL, true, now(), now()),
  (gen_random_uuid(), 'US-*', 'initial_evaluation_due', 60, 'Initial evaluation must be completed', NULL, true, now(), now())
ON CONFLICT (jurisdiction, kind) DO NOTHING;

-- Seed demo child for default workspace
INSERT INTO children (id, org_id, name, school_name, dob, created_at, slug)
VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000000', 'Demo Child', NULL, NULL, now(), 'demo-child')
ON CONFLICT (slug) DO NOTHING;

-- Seed entitlements for demo org (dev)
INSERT INTO entitlements (id, org_id, plan, features_json)
VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000000', 'pro', '{"ask":true,"smart_attachments":true,"letters":{"render":true,"send":true},"brief":true}')
ON CONFLICT (org_id) DO NOTHING;

-- Backfill org_id columns for multi-tenant hardening (idempotent)
-- These statements are safe to run multiple times and only fill NULLs
UPDATE documents d
SET org_id = c.org_id
FROM children c
WHERE d.child_id = c.id AND d.org_id IS NULL;

UPDATE doc_spans s
SET org_id = d.org_id
FROM documents d
WHERE s.document_id = d.id AND s.org_id IS NULL;

UPDATE iep_extract i
SET org_id = d.org_id
FROM documents d
WHERE i.document_id = d.id AND i.org_id IS NULL;

UPDATE deadlines dl
SET org_id = c.org_id
FROM children c
WHERE dl.child_id = c.id AND dl.org_id IS NULL;

UPDATE letters l
SET org_id = c.org_id
FROM children c
WHERE l.child_id = c.id AND l.org_id IS NULL;

UPDATE claims cl
SET org_id = c.org_id
FROM children c
WHERE cl.child_id = c.id AND cl.org_id IS NULL;

UPDATE eobs e
SET org_id = COALESCE(cl.org_id, d.org_id)
FROM claims cl
LEFT JOIN documents d ON d.id = e.document_id
WHERE e.claim_id = cl.id AND e.org_id IS NULL;

UPDATE child_profile p
SET org_id = c.org_id
FROM children c
WHERE p.child_id = c.id AND p.org_id IS NULL;

UPDATE job_runs j
SET org_id = c.org_id
FROM children c
WHERE j.child_id = c.id AND j.org_id IS NULL;

