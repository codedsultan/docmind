-- Add foreign key constraints from agent tables → users
-- These tables carry userId TEXT NOT NULL with no FK enforcement.
-- Adding ON DELETE CASCADE so user deletion cleans up orphaned rows.

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "tool_call_audits"
  ADD CONSTRAINT "tool_call_audits_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "query_traces"
  ADD CONSTRAINT "query_traces_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;

-- Rollback:
-- ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_userId_fkey";
-- ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_userId_fkey";
-- ALTER TABLE "tool_call_audits" DROP CONSTRAINT IF EXISTS "tool_call_audits_userId_fkey";
-- ALTER TABLE "query_traces" DROP CONSTRAINT IF EXISTS "query_traces_userId_fkey";