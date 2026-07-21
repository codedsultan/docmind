CREATE TYPE "DocumentVisibility" AS ENUM ('private', 'public');

CREATE TABLE "documents" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "userId"      TEXT        NOT NULL,
  "title"       TEXT        NOT NULL,
  "contentHash" TEXT        NOT NULL,
  "sourceType"  TEXT        NOT NULL,
  "visibility"  "DocumentVisibility" NOT NULL DEFAULT 'private',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "documents_contentHash_key" ON "documents"("contentHash");

-- Rollback:
-- DROP TABLE IF EXISTS "documents";
-- DROP TYPE IF EXISTS "DocumentVisibility";
