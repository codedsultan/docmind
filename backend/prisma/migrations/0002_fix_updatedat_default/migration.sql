-- Corrective migration: add DEFAULT CURRENT_TIMESTAMP to updatedAt.
-- Migration 0001 created this column as NOT NULL with no default, causing
-- raw SQL inserts outside of Prisma to fail. This is safe to re-run on
-- databases where 0001 was already applied.

ALTER TABLE "documents"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Rollback:
-- ALTER TABLE "documents" ALTER COLUMN "updatedAt" DROP DEFAULT;
