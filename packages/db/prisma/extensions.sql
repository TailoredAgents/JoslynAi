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
