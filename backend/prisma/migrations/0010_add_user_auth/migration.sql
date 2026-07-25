-- Phase 5 auth: rename User → users, add passwordHash, drop name
ALTER TABLE "User" RENAME TO "users";
ALTER INDEX "User_pkey" RENAME TO "users_pkey";
ALTER INDEX "User_email_key" RENAME TO "users_email_key";

-- Add passwordHash (allow empty default during migration, then drop it)
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP DEFAULT;

-- Drop name (not used in auth model)
ALTER TABLE "users" DROP COLUMN IF EXISTS "name";

-- Rollback (reverse order, respecting dependencies):
-- 1. Re-add "name" column (type depends on schema state before this migration; e.g. TEXT)
--    ALTER TABLE "users" ADD COLUMN "name" TEXT;
-- 2. Drop passwordHash
--    ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordHash";
-- 3. Rename indexes back to original names
--    ALTER INDEX "users_pkey" RENAME TO "User_pkey";
--    ALTER INDEX "users_email_key" RENAME TO "User_email_key";
-- 4. Rename table back to original name
--    ALTER TABLE "users" RENAME TO "User";
