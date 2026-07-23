-- Create RiskTier enum
CREATE TYPE "RiskTier" AS ENUM ('read', 'internal_write', 'external_write');

-- Create notes table
CREATE TABLE IF NOT EXISTS "notes" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"        TEXT NOT NULL,
  "content"       TEXT NOT NULL,
  "sourceQueryId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- Create tasks table
CREATE TABLE IF NOT EXISTS "tasks" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"        TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT,
  "dueAt"         TIMESTAMP(3),
  "done"          BOOLEAN NOT NULL DEFAULT false,
  "sourceQueryId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- Create tool_call_audits table
CREATE TABLE IF NOT EXISTS "tool_call_audits" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT NOT NULL,
  "toolName"  TEXT NOT NULL,
  "riskTier"  "RiskTier" NOT NULL,
  "params"    JSONB NOT NULL,
  "result"    JSONB,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "error"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tool_call_audits_pkey" PRIMARY KEY ("id")
);

-- Create query_traces table
CREATE TABLE IF NOT EXISTS "query_traces" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"           TEXT NOT NULL,
  "query"            TEXT NOT NULL,
  "retrievedChunks"  JSONB NOT NULL,
  "provider"         TEXT NOT NULL,
  "model"            TEXT NOT NULL,
  "latencyBreakdown" JSONB NOT NULL,
  "cacheFlags"       JSONB NOT NULL,
  "toolCallAuditIds" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "query_traces_pkey" PRIMARY KEY ("id")
);
