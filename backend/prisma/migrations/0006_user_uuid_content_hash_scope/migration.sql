-- Create users table with UUID primary key (User model — staged for Phase 5 auth)
CREATE TABLE IF NOT EXISTS "User" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "email"     TEXT        NOT NULL,
  "name"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- Scope contentHash uniqueness to (userId, contentHash) instead of globally unique.
-- Two users can upload the same document content without colliding.
DROP INDEX IF EXISTS "documents_contentHash_key";
CREATE UNIQUE INDEX "documents_userId_contentHash_key" ON "documents"("userId", "contentHash");

-- Rollback:
-- DROP INDEX IF EXISTS "documents_userId_contentHash_key";
-- CREATE UNIQUE INDEX "documents_contentHash_key" ON "documents"("contentHash");
-- DROP TABLE IF EXISTS "User";
