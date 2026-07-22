# Changelog

All notable changes to DocMind are logged here, phase by phase. This is the public-facing history — day-to-day working notes live in a local, gitignored session log used to drive AI-assisted development.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Lint cleanup: fixed 65 ESLint errors (frontend + backend) — unsafe `any` assignments, unused imports, unhandled promises, `async`-without-`await` mocks, and `set-state-in-effect` violations.

## Ingestion & Basic Q&A — 2026-07-21

### Added

#### Ingestion Pipeline
- `POST /api/v1/documents/upload` — multipart upload endpoint accepting PDF, Markdown, and plain text files (10 MB max, file-type validated).
- `ParserService` — parses PDF (via `pdf-parse`), Markdown (frontmatter-stripped), and plain text into raw text.
- `ChunkerService` — paragraph/sentence-bounded chunking (800-char target, 150-char overlap, sha256 contentHash for deduplication).
- `IngestionProcessor` (BullMQ worker) — loads document from DB, chunks text, batch-embeds via Gemini, stores chunks in pgvector with ON CONFLICT DO NOTHING, updates status, emits `DocumentIngestedEvent`.
- `DocumentIngestedEvent` — event emitted after successful ingestion via `EventEmitter2`.

#### Retrieval & Q&A
- `RetrievalService` — pgvector cosine similarity search via raw SQL with userId scoping.
- `POST /api/v1/chat/query` — context-grounded generation over retrieved chunks with source citation and 200-char preview truncation.
- `DEV_USER_ID` constant for single-user mode (auth retrofitted in Phase 5).

#### Provider Layer
- `EmbeddingProvider` / `GenerationProvider` TypeScript interfaces with NestJS DI tokens for swappable implementations.
- `GeminiEmbeddingProvider` — `gemini-embedding-001`, 768-dim output, 100-text batch splitting, exponential-backoff retry on 429/5xx.
- `GeminiGenerationProvider` — `gemini-2.0-flash`, supports `generate()` and `generateStream()` (SSE token yielding), retry with backoff.
- `GroqGenerationProvider` — Groq Chat Completions API, same interface, selected via `PROVIDER` env var (`gemini` | `groq`).
- `ProvidersModule` — factory-based provider selection reading `ConfigService` at module init.

#### Schema & Database
- `Document` model: id (uuid v7), userId, title, contentHash (unique composite), sourceType enum, visibility enum, status enum (pending/processing/ready/failed), isActive, version, rawText.
- `Chunk` model: 768-dim vector embedding column, documentId + contentHash unique constraint, chunkIndex.
- `IngestionStatus` / `SourceType` / `DocumentVisibility` Prisma enums.
- Hand-written migrations: pgvector extension, document schema, HNSW index on embedding column, rawText column.

#### Frontend
- `/documents` page — upload form with file/title/visibility inputs, document list with status badges (pending/processing/ready/failed), version counter, soft-delete.
- `/chat` page — query input, streaming answer display (SSE-ready), expandable source chunks with similarity scores.
- Layout navigation with header.

#### Security
- `AuthGuard` — API key authentication via `Authorization: Bearer` header using `crypto.timingSafeEqual`.
- `ThrottlerGuard` — 20 req/60s globally, 5 req/min on upload endpoint.
- Helmet middleware for security headers.
- CORS configurable via `CORS_ORIGIN` env var.
- `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`.
- Log redaction: PII excluded from notification processor logs.
- `docker-compose.prod.yml`: Postgres/Redis ports not publicly bound, Redis `requirepass`.

#### Tests
- `GeminiEmbeddingProvider` — empty input fast-path, batch shape, split into batches of 100, 429 retry exhaustion, recovery after transient 429, missing API key on construction.
- `GeminiGenerationProvider` — generate response parsing, non-ok error, recovery after transient 429, SSE streaming token collection, stream API error.
- `GroqGenerationProvider` — generate and streaming tests.
- `ChunkerService` — empty string, whitespace-only, single chunk, multi-chunk with paragraph boundaries, sequential chunkIndex, idempotency, overlap preservation, long paragraph sentence-split.
- `IngestionProcessor` — success status transitions (processing→ready), embedding error (→failed retry), zero-chunk skip, missing rawText, document not found, embedding count mismatch, event emission payload, event suppression on failure, vector string format.
- `RetrievalService` — userId isolation, userId in raw SQL params, empty embedding fast-path, visibility filtering, no-visibility fallback.
- `IngestionService` — upload flow, content-hash dedup, soft-delete reactivation, userId-scoped dedup lookup, list/get/delete operations.

### Changed
- `InternalKeyGuard` refactored to inject `ConfigService`; `INTERNAL_API_KEY` added to Joi validation schema.
- Title fallback applies `.slice(0, 255)` in `uploadDocument()`.
- `FileTypeValidator` regex tightened to full-string match.
- Dockerfile EXPOSE 4000 → 4500; healthcheck URL updated; compose port mappings aligned.
- Groq provider changed from eager registration to lazy instantiation inside factory (no crash when `GROQ_API_KEY` absent).

### Fixed
- Docker compose fresh-volume smoke test: all services start cleanly, health endpoint returns DB-connected status.

## Bootstrap — 2026-07-18

### Added
- Repo bootstrapped from the [`js-stack`](https://github.com/codedsultan/js-stack) template (NestJS + Next.js 16 + Postgres/pgvector + Redis, pnpm monorepo).
- Three-stage CI/CD pipeline: CI Gates → Container Build → Deploy (deploy currently gated off).
- Public-repo guardrails: `seeds/`, PDFs, and resume-shaped filenames gitignored.
- `docker-compose.yml` (dev) and `docker-compose.prod.yml` (production) with pgvector/pg16, Redis with healthchecks.
- Hand-written Prisma migrations: pgvector extension, document schema with `DocumentVisibility` enum.
- Swagger UI at `/docs` via `@nestjs/swagger`.
- `cmd/dev-start.sh` — quick local dev startup.
- Notification queue (BullMQ) with email notification processor.
- `InternalKeyGuard` for internal service authentication.

### Changed
- Starter branding renamed `jsstack` → `docmind` across package names, Docker Compose services, env files, and CI registry paths.
- Postgres image `postgres:16-alpine` → `pgvector/pgvector:pg16`; added missing `migrate` service.
- Port assignments set to non-default values (backend 4500, frontend 3400, Postgres 5349, Redis 6399) to avoid VPS conflicts.
- CI/CD split into `ci` / `build` / `deploy` workflows with EC2 deployment via WireGuard SSH.
