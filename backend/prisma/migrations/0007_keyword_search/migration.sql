-- Add generated tsvector column for full-text search on chunks.content
ALTER TABLE "chunks"
  ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for efficient full-text search
CREATE INDEX IF NOT EXISTS "chunks_content_tsv_idx"
  ON "chunks" USING GIN ("content_tsv");

-- Rollback:
-- DROP INDEX IF EXISTS "chunks_content_tsv_idx";
-- ALTER TABLE "chunks" DROP COLUMN IF EXISTS "content_tsv";
