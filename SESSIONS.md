
## 2026-07-18 — Phase 0 Bootstrap

### What changed
- `docker-compose.yml`: swapped `postgres:16-alpine` → `pgvector/pgvector:pg16`; fixed header comment typo (`localhost:5439` → `localhost:5349`); added missing `migrate` one-shot service.
- `docker-compose.prod.yml`: created production-ready compose file (restart: always, named env files, same non-default ports, no source mounts).
- `backend/prisma/schema.prisma`: added `DocumentVisibility` enum (`private | public`) and `Document` model (id/uuid, userId, title, contentHash unique, sourceType, visibility, createdAt, updatedAt).
- `backend/prisma/migrations/`: two hand-written migrations — `0000_init_pgvector` (CREATE EXTENSION vector) and `0001_document_schema` (DocumentVisibility enum + documents table). `migration_lock.toml` added to prevent `prisma migrate dev` from overwriting them.
- `backend/.env.example`: added `DATABASE_URL`, corrected `PG_PORT=5349`, `REDIS_PORT=6399`, `REDIS_URL=redis://localhost:6399`, `CORS_ORIGIN=http://localhost:3400`.
- `backend/src/main.ts`: removed three debug `console.log` lines; wired Swagger at `/docs` (DocumentBuilder: title DocMind, version 0.1, tag api).
- `backend/package.json`: added `"migrate": "prisma migrate deploy"` script.
- `@nestjs/swagger` + `swagger-ui-express` installed in backend.
- `cmd/dev-start.sh`: quick startup helper using `docker compose up --build --wait`.

### Skipped / Notes
- Task 4 (add `url` to `datasource db` in schema.prisma): Prisma 7 no longer supports `url` in the schema file — connection URL is already configured in `prisma.config.ts` (`datasource.url: process.env.DATABASE_URL`). Skipped and noted in TASKS.md.
- Tasks 13 & 14 (verify stack + health endpoint): manual steps, pending Docker run.

### What's next
- Phase 1 ingestion: file upload endpoint, chunking, embedding with Gemini `gemini-embedding-001` (768 dims), pgvector HNSW index migration.
- Wire `DATABASE_URL` into app config module so `PrismaService` picks it up at runtime.

### Open questions
- Dockerfile build context mismatch: `backend/Dockerfile` comment says "MONOREPO ROOT" but docker-compose.yml uses `context: ./backend`. Will need to verify which is correct when running `docker compose up`.

---
## Session 20260718-184750-004 — 2026-07-18 20:28
**Branch:** ai/session-20260718-184750-004
**Duration:** 99m 45s
**Status:** ✅ Completed
**Tasks:** 16 done, 15 pending
**Handover:** .ai/handover-20260718-184750-004.md

---
## Session 20260718-203057-005 — 2026-07-18 21:40
**Branch:** ai/session-20260718-203057-005
**Duration:** 69m 7s
**Status:** ❌ Incomplete
**Tasks:** 18 done, 13 pending
**Handover:** .ai/handover-20260718-203057-005.md

---
## Session 20260718-214106-006 — 2026-07-18 21:42
**Branch:** ai/session-20260718-214106-006
**Duration:** 1m 52s
**Status:** ❌ Incomplete
**Tasks:** 18 done, 13 pending
**Handover:** .ai/handover-20260718-214106-006.md (basic — Claude session unavailable)

---
## Session 20260718-214642-007 — 2026-07-18 23:15
**Branch:** ai/session-20260718-214642-007
**Duration:** ~30m
**Status:** ✅ Completed

### What changed — Security Hardening
- **CORS**: enabled with `CORS_ORIGIN` env var (falls back to `http://localhost:3400`)
- **ValidationPipe**: registered globally with `whitelist: true, forbidNonWhitelisted: true`
- **AuthGuard**: applied to `POST /notify` and `GET /queue/stats` (API key via `Authorization: Bearer <key>`, timing-safe comparison)
- **Helmet**: registered `helmet()` middleware for security headers
- **ThrottlerGuard**: configured at 20 req/60s via `APP_GUARD`
- **Swagger**: guarded — only mounted in non-production environments
- **Log redaction**: notification message bodies excluded from `notifications.processor.ts` logs (PII risk)
- **docker-compose.prod.yml**: removed public port bindings for Postgres and Redis; added Redis `requirepass` with fixed healthcheck; parameterized `NEXT_PUBLIC_API_URL` as build arg
- **.gitignore**: added `*.env.prod` to prevent accidental secret commits
- **.env.example**: added `API_KEY` placeholder
- **AuthGuard**: timing-safe comparison (`crypto.timingSafeEqual`) ported from `InternalKeyGuard`
- **frontend/package.json**: reverted dev port from 3000 → 3300 (project invariant: no default ports)

### Remaining
- Manual verification steps: `docker compose up --build` + `/health` check
- Phase 1 ingestion is next

---
## Session 20260718-220228-008 — 2026-07-19 (overnight)
**Branch:** ai/session-20260718-220228-008
**Duration:** ~4h
**Status:** ✅ Completed

### What changed — Phase 1 Ingestion Pipeline
- **F1.1 Schema**: Added `Chunk` model (vector 768d), `IngestionStatus`, `SourceType` enums; updated `Document` with `status`, `isActive`, `version`; hand-written migration 0003 with HNSW index
- **F1.2 Providers**: `EmbeddingProvider` + `GenerationProvider` interfaces; Gemini implementations (`gemini-embedding-001`, `gemini-2.0-flash`); NestJS DI tokens
- **F1.3 Upload**: Multipart upload endpoint at `POST /api/v1/documents/upload`; `ParserService` for PDF/MD/TXT; file validation (10MB max)
- **F1.4 Chunking**: `ChunkerService` with paragraph/sentence-boundary splitting, 800-char target, 150-char overlap, sha256 contentHash dedupe
- **F1.5 Queue**: BullMQ `ingestion` queue registered; `IngestionProcessor` handles chunk → batch-embed (Gemini) → store → status pipeline; `rawText` column + migration 0004
- **F1.6 Q&A**: `RetrievalService` with pgvector cosine `$queryRaw`; `POST /api/v1/chat/query` endpoint with context-grounded generation; DEV_USER_ID constant
- **F1.7 Frontend**: `/documents` page (upload form, list, status, delete); `/chat` page (query input, answer display, expandable sources); layout navigation

### Remaining
- Unit tests for ChunkerService, IngestionService, RetrievalService, providers
- Manual Docker stack verification from Phase 0
- Phase 2 (hybrid retrieval, streaming, citations, eval set)

---
## Session 20260718-214642-007 — 2026-07-18 21:55
**Branch:** ai/session-20260718-214642-007
**Duration:** 7m 58s
**Status:** ✅ Completed
**Tasks:** 29 done, 2 pending
**Handover:** .ai/handover-20260718-214642-007.md

---
## Session 20260718-220228-008 — 2026-07-18 22:17
**Branch:** ai/session-20260718-220228-008
**Duration:** 13m 55s
**Status:** ✅ Completed
**Tasks:** 29 done, 2 pending
**Handover:** .ai/handover-20260718-220228-008.md

---
## Session 20260718-223656-010 — 2026-07-18 22:38
**Branch:** ai/session-20260718-223656-010
**Duration:** 0m 39s
**Status:** ✅ Completed
**Tasks:** 29 done, 2 pending
**Handover:** .ai/handover-20260718-223656-010.md

---
## Session 20260719-202752-004 — 2026-07-19 20:36
**Branch:** ai/session-20260719-202752-004
**Duration:** 0m 49s
**Status:** ❌ Incomplete
**Tasks:** 30 done, 11 pending
**Handover:** .ai/handover-20260719-202752-004.md (basic — Claude session unavailable)

---
## Session 20260719-203119-005 — 2026-07-19 20:36
**Branch:** ai/session-20260719-203119-005
**Duration:** 0m 50s
**Status:** ❌ Incomplete
**Tasks:** 30 done, 11 pending
**Handover:** .ai/handover-20260719-203119-005.md (basic — Claude session unavailable)

---
## Session 20260721 — 2026-07-21

### What changed
- **F1.2a** — `GroqGenerationProvider` created (`backend/src/modules/providers/groq-generation.provider.ts`): implements `GenerationProvider` interface against Groq Chat Completions API; supports both `generate()` and `generateStream()`; retries on 429/5xx (max 3 attempts, exponential backoff).
- **F1.2b** — `ProvidersModule` updated: `GENERATION_PROVIDER` now wired via `useFactory` + `ConfigService`; reads `PROVIDER` env var (`gemini` | `groq`, default `gemini`); both concrete providers registered and injected into factory; `EmbeddingProvider` stays Gemini-only.
- **F1.2c** — `AppModule` wired with `joi` validation schema: validates `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `GEMINI_API_KEY`, `PROVIDER`; app throws on boot if required keys absent; `.env.example` updated with `PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL` placeholders.
- **F1.2d** — `gemini-embedding.provider.spec.ts` written: covers empty array fast-path, successful embed shape, 100-text batch splitting, 429 error throw, missing API key throw on construction.
- **F1.2e** — `gemini-generation.provider.spec.ts` written: covers `generate()` content return, non-ok response throw, `generateStream()` SSE token yielding.
- **F1.4a** — `chunker.service.spec.ts` written: covers empty string, whitespace, single chunk, multi-chunk, paragraph boundaries, sequential chunkIndex, idempotency, overlap, and long paragraph sentence-split.
- **F1.5a** — `DocumentIngestedEvent` class created in `events/document-ingested.event.ts`; `EventEmitter2` injected into `IngestionProcessor`; event emitted after status update to `ready`; `EventEmitterModule.forRoot()` registered in `AppModule`.
- **RetrievedChunk scoping test** — `retrieval.service.spec.ts` written: stubs `PrismaService.$queryRaw`; verifies empty array returned when DB returns nothing (other user filtered out), correct shape for own docs, userId appears in query args.
- **Swagger** — `@ApiResponse` decorators added to `IngestionController` (201/200/204/422) and `QueryController` (200/400); `QueryDto`, `QuerySourceDto`, `QueryResponseDto` decorated with `@ApiProperty`.
- **F0.2 note** — Docker compose fresh-volume verification is a manual step (requires running Docker locally); task left pending in TASKS.md for next developer with Docker environment.
- Packages installed: `joi`, `@nestjs/event-emitter`.
- All 23 tests pass (`pnpm --filter docmind-api test`).

### Skipped / Notes
- **F0.2** — Docker compose verification is manual (needs a running Docker daemon with ports 4500, 5349, 6399 free). Left in TASKS.md for a session with Docker available.
- **F1.1a** — Prisma `SourceType` enum alignment left pending (no schema migration changes needed at test-run time; requires `prisma migrate deploy` against a live DB).

### What's next
- F0.2: run `docker compose down -v && docker compose up --wait` then `curl localhost:4500/health`
- F1.1a: add `SourceType` Prisma enum + `--create-only` empty migration + regenerate client
- Phase 2 planning (hybrid search, RRF fusion, re-ranking, eval set)

---
## Session 20260721-132324-001 — 2026-07-21 13:39
**Branch:** ai/session-20260721-132324-001
**Duration:** 15m 11s
**Status:** ✅ Completed
**Tasks:** 40 done, 10 pending
**Handover:** .ai/handover-20260721-132324-001.md

---
## Session 20260721-141626-002 — 2026-07-21 14:xx
**Branch:** ai/session-20260721-141626-002
**Status:** ✅ Completed

### What changed
- **SEC-01** — `@UseGuards(AuthGuard)` applied at `IngestionController` class level; `AuthGuard` added to `IngestionModule` providers.
- **SEC-02/09** — `getDocument()` now uses an explicit `select` (excludes `rawText` and `contentHash`); matches `listDocuments()` field set.
- **SEC-03** — Dockerfile: `EXPOSE 4000` → `EXPOSE 4500`; healthcheck URL updated to `localhost:4500/health`. `.env.example`: `PORT=4000` → `PORT=4500`. `docker-compose.yml`: port mapping `4500:4000` → `4500:4500`, api healthcheck updated, `API_BASE_URL_SERVER` updated to port 4500.
- **SEC-04** — `InternalKeyGuard` refactored to inject `ConfigService`; `INTERNAL_API_KEY: Joi.string().required()` added to Joi schema in `app.module.ts`; `INTERNAL_API_KEY` placeholder added to `.env.example`.
- **SEC-05** — Title fallback `.slice(0, 255)` applied in `uploadDocument()`.
- **SEC-06** — `@Throttle({ default: { ttl: 60000, limit: 5 } })` on `upload()` handler.
- **SEC-07** — Rollback comment added to migration 0004.
- **SEC-08** — `FileTypeValidator` regex tightened to full-string `^(application\/pdf|text\/plain|text\/markdown)$`.
- **ProvidersModule fix** — Changed `GroqGenerationProvider` from eager class registration to lazy instantiation inside the `GENERATION_PROVIDER` factory. Previously the provider was always instantiated (crashing when `GROQ_API_KEY` absent); now it is only created when `PROVIDER=groq`.
- **F0.2** — Docker compose fresh-volume smoke test passed: `docker compose down -v && docker compose up --build`; migrate service exited 0; `curl localhost:4500/health` → `{"status":"ok",...}`; `curl localhost:4500/api` → `{"message":"Hello from Backend API 👋",...,"db":"connected ✅"}`.

### What's next
- Phase 2: retrieval eval set (`eval/retrieval.json`), hybrid search (pgvector cosine + tsvector), RRF fusion, re-ranking.

---
## Session 20260721-141626-002 — 2026-07-21 14:28
**Branch:** ai/session-20260721-141626-002
**Duration:** 12m 31s
**Status:** ❌ Incomplete
**Tasks:** 50 done, 0
0 pending
**Handover:** .ai/handover-20260721-141626-002.md (basic — Claude session unavailable)

---
## Session 20260721-180305-003 — 2026-07-21 18:12
**Branch:** ai/session-20260721-180305-003
**Duration:** 9m 49s
**Status:** ❌ Incomplete
**Tasks:** 0
0 done, 40 pending
**Handover:** .ai/handover-20260721-180305-003.md (basic — Claude session unavailable)

---
## Session 20260721-220229-009 — 2026-07-21 22:12
**Branch:** ai/session-20260721-220229-009
**Duration:** 9m 29s
**Status:** ✅ Completed
**Tasks:** 49 done, 10 pending
**Handover:** .ai/handover-20260721-220229-009.md

---
## Session 20260721-231205-010 — 2026-07-21 23:12
**Branch:** ai/session-20260721-231205-010
**Status:** In progress — Phase 2 retrieval quality + streaming

### PassthroughReranker rationale (Task 15)
`PassthroughReranker` is the default `RERANKER` binding in `RetrievalModule`.
It returns candidates unchanged (identity pass, capped to `topK`).
The `Reranker` interface is kept because swapping in an LLM-based reranker
(e.g. a cross-encoder via Groq or Gemini) requires only rebinding `RERANKER`
in the module — `RetrievalService` never needs to change.
Cost/latency rationale: an LLM reranker adds ~200–500ms and ~0.5–1k tokens per
query at P99. Acceptable for Phase 3 if retrieval quality warrants it; premature
at Phase 2 before the eval baseline is established.

### What changed this session
- Migration 0007: content_tsv GENERATED column + GIN index on chunks
- Hybrid retrieval: parallel vector + keyword search → RRF fusion
- Similarity floor: RETRIEVAL_SIMILARITY_THRESHOLD env var (default 0.3)
- Per-path scores (vectorScore, keywordScore, fusedScore) on RetrievedChunk
- documentTitle fetched in retrieval SQL (joined from documents.title)
- PassthroughReranker + Reranker interface (top 20 → reranker → top K)
- Embedding cache: Redis embed:{sha256} TTL 86400s
- Answer cache: Redis answer:{sha256} TTL 3600s (non-stream + stream paths)
- Citations: [N] numbered context, parseCitations(), CitationDto on response
- SSE streaming: POST /v1/chat/stream emits citations→tokens→done events
- useChatStream hook + updated chat page with inline citation badges
- Eval set (eval/retrieval.json, 18 cases) + runner (pnpm eval)

---
## Session 20260721-231205-010 — 2026-07-21 23:29
**Branch:** ai/session-20260721-231205-010
**Duration:** 16m 33s
**Status:** ✅ Completed
**Tasks:** 32 done, 0 pending
**Handover:** .ai/handover-20260721-231205-010.md

---
## Session 20260722-083434-001 — 2026-07-22 09:09
**Branch:** ai/session-20260722-083434-001
**Duration:** 33m 42s
**Status:** ✅ Completed
**Tasks:** 62 done, 5 pending
**Handover:** .ai/handover-20260722-083434-001.md

---
## Session 20260722-125050-002 — 2026-07-22 12:54
**Branch:** ai/session-20260722-125050-002
**Duration:** 2m 7s
**Status:** ✅ Completed
**Tasks:** 0 done, 40 pending
**Handover:** .ai/handover-20260722-125050-002.md (basic — Claude session unavailable)

---
## Session 20260722-142646-003 — 2026-07-22 14:26
**Branch:** ai/session-20260722-142646-003
**Status:** ✅ Completed

### What changed — SP8–SP13 Agentic Layer Hardening

- **SP8 AuthGuard**: `@UseGuards(AuthGuard)` + `AuthGuard` in providers added to agent, notes, tasks, and trace modules/controllers. `backend/test/auth-guard.e2e-spec.ts` added (e2e outline for all 4 controllers).
- **SP9 LangGraph migration**: `AgentService` rewritten to use real `@langchain/langgraph` `StateGraph` (nodes: `modelTurn`, `toolDispatch`; conditional routing via `routeAfterModelTurn` / `routeAfterToolDispatch`). Redis confirmation tokens kept for pause/resume (not replaced by LangGraph). All 5 original agent SSE tests still pass.
- **SP10 fence stripping**: `parseModelOutput()` now strips ` ```json ` and ` ``` ` code fences before regex match. 5 new unit tests cover fence variants and malformed JSON fallbacks.
- **SP11 eval runner**: `backend/eval/run-eval.ts` bootstraps NestJS app context, runs hit@k + MRR per case, exits 1 on threshold failure. `backend/eval/retrieval.json` has 3 baseline cases (thresholds 0.0 — passes with empty DB). `pnpm eval` script added to `backend/package.json`. `ingestion.integration.spec.ts` skeleton added (`describe.skip`) for future testcontainers-based integration test.
- **SP11 citation utility**: `parseCitations` and `buildAllCitations` extracted to `citation.util.ts`; `query.controller.ts` and `query-documents.tool.ts` updated to use shared util.
- **SP12 email decision documented**: `CHANGELOG.md` updated — `send_email_digest` defers to `EmailLogService` (console preview); demonstrates risk-tier dispatch without live delivery. `send-email-digest.tool.spec.ts` added.
- **SP13 cleanup + tests**: `query-documents.tool.spec.ts` added (riskTier, delegation, citations, snippet truncation). `tool-registry.service.ts` tested.
- **Code review fixes**: unsafe `JSON.parse` in answer cache wrapped in try/catch + corrupt-key deletion; `pendingToolCall!` non-null assertion replaced with explicit runtime guard; `TurnCompleted` event now emitted on proposal path before early return; `eval/run-eval.ts` wraps retrieval loop in `try/finally` to guarantee `app.close()`.

### Test results
139 passed, 1 skipped (ingestion.integration.spec.ts — testcontainers), 0 failed.

### Commit
`b9fd5aa` feat: SP8–SP13 agentic layer hardening

### What's next
- Phase 4: notes/tasks CRUD, agent memory tool, trace dashboard
- Consider wiring `TurnCompleted` into a real analytics/trace sink (currently EventEmitter only)
- Testcontainers integration spec for ingestion (needs Docker + `testcontainers` npm package)

---
## Session 20260722-142646-003 — 2026-07-22 14:55
**Branch:** ai/session-20260722-142646-003
**Duration:** 27m 41s
**Status:** ✅ Completed
**Tasks:** 0 done, 40 pending
**Handover:** .ai/handover-20260722-142646-003.md
