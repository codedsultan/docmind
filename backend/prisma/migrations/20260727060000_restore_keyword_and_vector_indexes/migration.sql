-- Defensive restore migration.
--
-- Root cause: content_tsv (0007_keyword_search) and idx_chunks_embedding_hnsw
-- (0003_chunk_schema) are hand-written SQL objects that Prisma cannot express
-- in schema.prisma (a GENERATED ALWAYS AS STORED column, and a vector HNSW
-- index respectively). Neither was declared as an Unsupported() field/index,
-- so a subsequent `prisma migrate dev` run diffed the live DB against
-- schema.prisma, saw both as "not in schema", and generated DROP statements
-- for them as part of an unrelated migration (add_conversations).
--
-- This migration is fully idempotent (IF NOT EXISTS / IF EXISTS guards) so
-- it's safe to run whether or not the drop actually happened on a given
-- database. schema.prisma now declares content_tsv as Unsupported("tsvector")
-- to prevent this from recurring for the column; the two indexes below have
-- no equivalent protection in Prisma and must stay hand-maintained — see the
-- comments in schema.prisma next to the Chunk model.

-- Restore the generated tsvector column for full-text search on chunks.content
ALTER TABLE "chunks"
  ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Restore the GIN index backing keyword search
CREATE INDEX IF NOT EXISTS "chunks_content_tsv_idx"
  ON "chunks" USING GIN ("content_tsv");

-- Restore the HNSW index backing vector similarity search
CREATE INDEX IF NOT EXISTS "idx_chunks_embedding_hnsw" ON "chunks"
  USING hnsw ("embedding" vector_cosine_ops);
