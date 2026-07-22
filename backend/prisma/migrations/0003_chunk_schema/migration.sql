-- Create enums for source type and ingestion status
CREATE TYPE "SourceType" AS ENUM ('pdf', 'markdown', 'txt', 'html', 'rtf');
CREATE TYPE "IngestionStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- Add new columns to documents table
ALTER TABLE "documents"
  ADD COLUMN "status"   "IngestionStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "isActive" BOOLEAN           NOT NULL DEFAULT true,
  ADD COLUMN "version"  INTEGER           NOT NULL DEFAULT 1;

-- Migrate existing sourceType values (safe for empty dev DB)
ALTER TABLE "documents"
  ALTER COLUMN "sourceType" TYPE "SourceType"
  USING "sourceType"::"SourceType";

-- Create chunks table with vector(768) — fixed to Gemini gemini-embedding-001 output_dimensionality
CREATE TABLE "chunks" (
  "id"                TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "documentId"        TEXT        NOT NULL,
  "content"           TEXT        NOT NULL,
  "contentHash"       TEXT        NOT NULL,
  "chunkIndex"        INTEGER     NOT NULL,
  "embeddingProvider" TEXT        NOT NULL DEFAULT 'gemini-embedding-001',
  "embedding"         vector(768) NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE
);

-- Unique constraint for idempotent re-ingestion
CREATE UNIQUE INDEX "chunks_documentId_contentHash_key" ON "chunks"("documentId", "contentHash");

-- Lookup index for fetching all chunks of a document
CREATE INDEX "idx_chunks_documentId" ON "chunks"("documentId");

-- HNSW index on embedding column for fast vector similarity search.
-- Uses vector_cosine_ops which supports cosine distance operator (<=>).
-- Prisma cannot generate this; it must remain a hand-written migration.
CREATE INDEX "idx_chunks_embedding_hnsw" ON "chunks"
  USING hnsw ("embedding" vector_cosine_ops);

-- Rollback:
-- DROP INDEX IF EXISTS "idx_chunks_embedding_hnsw";
-- DROP INDEX IF EXISTS "idx_chunks_documentId";
-- DROP INDEX IF EXISTS "chunks_documentId_contentHash_key";
-- DROP TABLE IF EXISTS "chunks";
-- ALTER TABLE "documents" ALTER COLUMN "sourceType" TYPE TEXT USING "sourceType"::TEXT;
-- ALTER TABLE "documents" DROP COLUMN IF EXISTS "version";
-- ALTER TABLE "documents" DROP COLUMN IF EXISTS "isActive";
-- ALTER TABLE "documents" DROP COLUMN IF EXISTS "status";
-- DROP TYPE IF EXISTS "IngestionStatus";
-- DROP TYPE IF EXISTS "SourceType";
