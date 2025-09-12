-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Optional: add tsvector and vector columns for spans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'DocSpan' AND column_name = 'tsv'
  ) THEN
    ALTER TABLE "DocSpan" ADD COLUMN IF NOT EXISTS tsv tsvector;
    CREATE INDEX IF NOT EXISTS docspan_tsv_idx ON "DocSpan" USING GIN (tsv);
  END IF;
END$$;

-- Add vector column for embeddings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'DocSpan' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE "DocSpan" ADD COLUMN IF NOT EXISTS embedding vector(1536);
    CREATE INDEX IF NOT EXISTS docspan_embedding_idx ON "DocSpan" USING ivfflat (embedding vector_cosine_ops);
  END IF;
END$$;

