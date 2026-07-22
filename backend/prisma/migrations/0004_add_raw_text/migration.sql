-- Add rawText column to store parsed text content for async processing
ALTER TABLE "documents"
  ADD COLUMN "rawText" TEXT;

-- Rollback: ALTER TABLE "documents" DROP COLUMN IF EXISTS "rawText";
