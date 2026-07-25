
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
  - _Follow-up (SP16-B, 2026-07-23)_: The `EmailLogService`-only entry above is now stale. `SEC-010-5` subsequently added `SmtpEmailService` (nodemailer) with an `EMAIL_MODE` factory — `EMAIL_MODE=log` keeps the log default, `EMAIL_MODE=send` uses real SMTP. `SP16-B` then completes the story by injecting `NotesService.findRecent` + `GenerationProvider` into `SendEmailDigestTool.execute`, replacing the `[Digest content would appear here]` placeholder with an AI-generated summary of the user's 10 most recent notes.
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

---
## Session 20260722-165128-004 — 2026-07-22 16:55
**Branch:** ai/session-20260722-165128-004
**Duration:** 4m 2s
**Status:** ❌ Incomplete
**Tasks:** 0
0 done, 35 pending
**Handover:** .ai/handover-20260722-165128-004.md (basic — Claude session unavailable)

---
## Session 20260722-220556-010 — 2026-07-22 22:41
**Branch:** ai/session-20260722-220556-010
**Duration:** 19m 56s
**Status:** ✅ Completed
**Tasks:** 25 done, 23 pending
**Handover:** .ai/handover-20260722-220556-010.md

---
## Session 20260722-224934-011 — 2026-07-22 22:55
**Branch:** ai/session-20260722-224934-011
**Commit:** `7ddba8c`
**Duration:** ~16m
**Status:** ✅ Completed

### What changed — Security fixes (SEC-010-1 through SEC-010-7)

All 7 security findings from the previous review session were fixed:

- **SEC-010-1** (HIGH): Bound userId to Redis confirmation token in `tool-registry.service.ts`. `dispatchExternalWrite` now stores `{ toolName, params, userId }`; `executeConfirmed` asserts `parsed.userId === ctx.userId`, throws 403 if mismatch. Audit row written in both cases.
- **SEC-010-2**: Removed `|| true` from CI `pnpm audit` step so dependency vulns now block. Snyk `continue-on-error: true` deferred until `SNYK_TOKEN` is configured in repo secrets.
- **SEC-010-3**: Redacted `recipient` from `SendEmailDigestTool` return value — no longer surfaces in SSE `tool_result` events.
- **SEC-010-4**: Added `ServiceUnavailableException` guard in `dispatchExternalWrite` when Redis is null — prevents issuing unconfirmable proposals.
- **SEC-010-5**: Added `SmtpEmailService` (nodemailer-based) + `EMAIL_MODE` factory in `EmailModule`. Defaults to `EmailLogService` (`EMAIL_MODE=log`); throws at startup if `EMAIL_MODE=send` without SMTP credentials.
- **SEC-010-6**: Reduced provider API error log verbosity — both `groq-generation.provider.ts` and `gemini-embedding.provider.ts` now log status-code only at ERROR level (body drained silently).
- **SEC-010-7**: Added `@MaxLength(200)` to `dueAt` in both `CreateTaskDto` and `UpdateTaskDto`; added `@IsUUID()` to `queryId` in `ConfirmDto`.

### Test results
141 tests passed, 17 suites, 0 failed. TypeScript compiles cleanly.

### Remaining Phase 4 items
- End-to-end eval verification (requires Docker stack locally)
- Branch protection gating for `eval-retrieval` (GitHub UI)
- Regression detection push test (CI push)
- Demo GIF/video (screen recording + running app)

---
## Session 20260722-224934-011 — 2026-07-22 22:55
**Branch:** ai/session-20260722-224934-011
**Duration:** 5m 30s
**Status:** ✅ Completed
**Tasks:** 37 done, 11 pending
**Handover:** .ai/handover-20260722-224934-011.md

---
## Session 20260723-182332-004 — 2026-07-23 18:43
**Branch:** ai/session-20260723-182332-004
**Duration:** 20m 2s
**Status:** ❌ Incomplete
**Tasks:** 17 done, 0
0 pending
**Handover:** .ai/handover-20260723-182332-004.md (basic — Claude session unavailable)

---
## Session 20260723-204622-006 — 2026-07-23
**Branch:** ai/session-20260723-204622-006
**Commits:** `27a340b`, `9c2ba80`
**Status:** ✅ F5.1 + F5.2 complete

### What changed — Phase 5 Auth (F5.1 + F5.2)

**F5.1 — JWT Auth Module**
- `AuthModule` with `AuthService` (argon2 hash + verify), `AuthController` (`POST /v1/auth/register` → 201, `POST /v1/auth/login` → 200), `JwtStrategy` (passport-jwt), `JwtAuthGuard` as global `APP_GUARD`
- `@Public()` decorator (`SetMetadata('isPublic', true)`) for unauthenticated routes; `@CurrentUser()` param decorator reads JWT payload from `request.user`
- `JwtPayload` interface: `{ sub: string; email: string }`
- Prisma migration `0010_add_user_auth`: renamed `User` → `users`, added `passwordHash TEXT NOT NULL`, dropped `name?` (applied via `prisma migrate deploy`)
- argon2 native build: added `"argon2"` to `pnpm.onlyBuiltDependencies` at workspace root `package.json`
- Config schema: `JWT_SECRET: Joi.string().min(32).required()`

**F5.2 — Remove DEV_USER_ID, wire userId from JWT**
- Deleted `DEV_USER_ID` from `backend/src/common/constants.ts`
- All controllers (`ingestion`, `notes`, `tasks`, `trace`, `agent`, `query`, `query-stream`) now read `userId` from `@CurrentUser() user: JwtPayload` and pass `user.sub` to services
- `IngestionService` + `RetrievalService` signatures changed from optional default to required `userId: string`; retrieval throws if called without userId
- `eval/run-eval.ts` + `eval/seed.ts`: local `EVAL_USER_ID` constant (no longer imports from constants.ts)
- `ingestion.integration.spec.ts`: local `TEST_USER_ID` constant
- `auth-guard.e2e-spec.ts`: complete rewrite — registers real user, gets JWT, route-audit sweeps all `/v1/` routes for 401 without token, confirms public routes skip guard

**Tests**
- `auth.service.spec.ts`: register (hash check, ConflictException), login (token, UnauthorizedException wrong pw / unknown user, JWT payload shape)
- `ownership.integration.spec.ts`: real Postgres via testcontainers, two users, notes/tasks/documents scoped to userA, asserts userB gets 404 on every cross-user access + list isolation

### What's next
- Run `pnpm test` + `pnpm test:integration` to confirm green (requires Docker for integration)
- F5.3: Frontend auth — login/register pages, Next.js API route handlers (httpOnly cookie), `frontend/src/lib/api.ts` JWT cookie support, `frontend/src/middleware.ts` route protection, logout
- F5.4: Deploy — EC2/VPS decision, GitHub secrets, `docker-compose.prod.yml`, CI deploy trigger
- SP15 regression proof: push branch to CI to confirm integration-test job catches vector regression

---
## Session 20260723-204622-006 — 2026-07-23 21:12
**Branch:** ai/session-20260723-204622-006
**Duration:** 25m 32s
**Status:** ✅ Completed
**Tasks:** 4 done, 60 pending
**Handover:** .ai/handover-20260723-204622-006.md

---
## Session 20260723-222437-007 — 2026-07-23 22:29
**Branch:** ai/session-20260723-222437-007
**Duration:** 4m 57s
**Status:** ❌ Incomplete
**Tasks:** 4 done, 60 pending
**Handover:** .ai/handover-20260723-222437-007.md (basic — Claude session unavailable)

---
## Session 20260724-002100-001 — 2026-07-24 01:01
**Branch:** ai/session-20260724-002100-001
**Duration:** 37m 34s
**Status:** ✅ Completed
**Tasks:** 6 done, 35 pending
**Handover:** .ai/handover-20260724-002100-001.md

---
## Session 20260724-011004-002 — 2026-07-24 05:27
**Branch:** ai/session-20260724-011004-002
**Duration:** 229m 38s
**Status:** ✅ Completed
**Tasks:** 6 done, 35 pending
**Handover:** .ai/handover-20260724-011004-002.md

---
## Session 20260724-101650-003 — 2026-07-24 10:17
**Branch:** ai/session-20260724-101650-003
**Duration:** 0m 45s
**Status:** ❌ Incomplete
**Tasks:** 6 done, 35 pending
**Handover:** .ai/handover-20260724-101650-003.md (basic — Claude session unavailable)

---
## Session 20260724-101923-004 — 2026-07-24 10:39
**Branch:** ai/session-20260724-101923-004
**Status:** ✅ Completed
**Commit:** a7822dc

### What changed
- Deleted `backend/src/common/guards/auth.guard.ts` — old API-key guard, superseded by JwtAuthGuard; no remaining imports
- Added `@Public()` to `AppController.notify` and `.queueStats` — both were returning 401 under the global JWT guard with no way to call them
- Scoped `TraceService.findOne(id, userId)` + updated `TraceController.findOne` and `.export` — cross-user trace access via guessed IDs is now blocked; consistent with all other controllers

### Confirmed already done (no code changes needed)
- `@MaxLength(1024)` on both DTOs (login + register)
- `@Throttle` rate limits on login/register endpoints
- `JwtStrategy.validate()` queries DB to verify user still exists
- JWT expiry set to `1d`
- `.env.example` JWT_SECRET placeholder is 32 chars
- All frontend auth pages, API route handlers, middleware, and LogoutButton

### What's next
- SP15 regression proof — manual CI run on a throwaway branch; cannot be automated
- F5.4 deploy target — EC2 vs VPS2/Caddy decision required from the user before any deploy tasks proceed
- F5.3 httpOnly cookie — current `httpOnly: false` is intentional for the direct-to-NestJS client architecture; changing to `true` requires routing all client API calls through Next.js proxy routes

---
## Session 20260724-101923-004 — F5.4 Deploy Target Decision

**Branch:** ai/session-20260724-101923-004

### Deploy Target: EC2 (confirmed)

The deploy target is **EC2** via WireGuard VPN, as established by `.github/workflows/deploy.yml`.

| Parameter | Value |
|-----------|-------|
| Compute | AWS EC2 instance |
| Network access | WireGuard VPN (`wg0`), peer IP `10.10.0.1` |
| SSH user | `${{ secrets.EC2_USER }}` |
| App directory | `/opt/apps/${APP_ENV}` (e.g. `/opt/apps/production`) |
| Container registry | GHCR (`ghcr.io`) — images pushed on `main` merge |
| Deploy trigger | `workflow_dispatch` on `deploy.yml` (or called from `ci.yml`) |

The deploy script SSHs into the EC2 instance via WireGuard, runs `./update-tags.sh` to point docker-compose at new image tags, then `docker compose pull && docker compose up -d`.

### HTTPS Strategy: ⚠️ Pending User Decision

HTTPS is **not yet configured** in the repository. Before triggering a production deploy, choose one of:

**Option A — Caddy (recommended):** Add a `Caddyfile` to `/opt/apps/production/` on the EC2 instance. Caddy automatically provisions Let's Encrypt certificates on first request. No cert renewal cron required.

```
docmind.example.com {
  reverse_proxy localhost:3400  # Next.js
}
api.docmind.example.com {
  reverse_proxy localhost:4500  # NestJS
}
```

**Option B — Certbot + nginx:** Install nginx on the EC2 host, run `certbot --nginx -d docmind.example.com`, set up auto-renewal with `certbot renew` cron.

### What Still Needs User Input Before F5.4 Can Continue

1. **Public hostname/IP** — not stored in the repo (inside the WireGuard `WG_CONFIG` secret). Confirm or update the public A record target.
2. **HTTPS strategy** — Caddy or Certbot+nginx (see above).
3. **GitHub secrets audit** — verify `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `JWT_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `EMAIL_DIGEST_RECIPIENT`, `SMTP_*`, `EC2_SSH_KEY`, `EC2_USER`, and `WG_CONFIG` are all set in the repo's production environment.

---
## Session 20260724-101923-004 — 2026-07-24 10:50
**Branch:** ai/session-20260724-101923-004
**Duration:** 29m 46s
**Status:** ✅ Completed
**Tasks:** 11 done, 37 pending
**Handover:** .ai/handover-20260724-101923-004.md

---
## Session 20260724-105435-005 — 2026-07-24 11:15
**Branch:** ai/session-20260724-105435-005
**Commit:** `84f215d`
**Status:** ✅ Completed

### What changed — SEC-20260723/20224 hardening + httpOnly cookie auth

**Backend security hardening:**
- Added `@Throttle({ ttl: 60000, limit: 10 })` on `agent/chat` and `@Throttle(20/min)` on `agent/confirm`
- Added `CORS_ORIGIN` to Joi config validation schema; consumed via `ConfigService` instead of bare `process.env`
- Added explicit CORS `methods` and `allowedHeaders` to `app.enableCors()`
- Normalized email to lowercase in `AuthService.register()` and `.login()` — prevents case-sensitive duplicate accounts
- Added `@MinLength(8) @MaxLength(128)` validation to `ConfirmDto.confirmationToken`
- Created hand-written migration `0011_add_fk_constraints` — FK + ON DELETE CASCADE from `notes`, `tasks`, `tool_call_audits`, `query_traces` → `users`
- Added `@relation` directives to Prisma schema for FK-backed tables; ran `prisma generate`
- Fixed lint error in `auth.service.spec.ts` (type-safe mock extraction)

**Frontend auth hardening (httpOnly cookies):**
- Changed `httpOnly: false` → `httpOnly: true` on login/register route handler cookies
- Created `/api/auth/token` route handler that reads the httpOnly cookie server-side
- Added client-side token cache (`clientToken` module variable) in `api.ts`
- `initClientToken()` called on mount in `Providers` — fetches token from `/api/auth/token`
- `clearClientToken()` called on logout button
- All frontend auth files committed: login/register pages, route handlers, middleware, LogoutButton

**Items confirmed already done (no changes needed):**
- JWT expiry `1d` (already in `auth.module.ts`)
- `JwtStrategy` DB user existence check (already in `jwt.strategy.ts`)
- Login/register `@Throttle(5/min)` (already in `auth.controller.ts`)
- `.env.example` JWT_SECRET placeholder is 32 chars (already correct)
- Old `AuthGuard` deleted, `AppController` routes have `@Public()`, `TraceController` filters by userId

### Test results
150 tests pass, 18 suites, 0 failed. Lint clean.

### What's next (manual / pending user input)
- SP15 regression proof — push throwaway branch to CI, confirm integration-test catches vector bug
- Stream 401 error — manual confirmation with dev server running
- F5.3 browser test — full loop (register → upload → chat → note → logout → redirect)
- F5.4 deploy — user must confirm public hostname and HTTPS strategy (Caddy vs Certbot)
- Documentation updates: `README.md` demo section, `docs/02-feature-breakdown.md` F5.1 done marker

---
## Session 20260724-105435-005 — 2026-07-24 11:11
**Branch:** ai/session-20260724-105435-005
**Duration:** 16m 30s
**Status:** ✅ Completed
**Tasks:** 35 done, 25 pending
**Handover:** .ai/handover-20260724-105435-005.md

---
## Session 20260724-131206-006 — 2026-07-24 13:12
**Branch:** ai/session-20260724-105435-005
**Duration:** ~30m
**Status:** ✅ Completed

### What changed — SEC-20260724-2 frontend/streaming security + 6 SEV items closed

**Fixed all 6 open SEC-20260724-2 findings:**

1. **SSE error leakage** (`query-stream.controller.ts:167-169`) — `err.message` no longer emitted to client; logged server-side with generic "internal error" message.
2. **Auth route error forwarding** (`login/route.ts`, `register/route.ts`) — backend error body logged server-side; client receives generic error message.
3. **CSP headers** — configured on frontend (`next.config.ts` `headers()` with explicit script-src, style-src, connect-src, etc.) and backend (`helmet()` with explicit CSP directives, `crossOriginEmbedderPolicy: false`).
4. **JWT blocklist on logout** — Redis-backed: `POST /v1/auth/logout` stores token `iat` as `blocklist:user:${sub}` (TTL 1d). `JwtStrategy.validate()` checks blocklist on every request. Frontend `logout/route.ts` reads `auth_token` cookie and sends as Bearer header to backend.
5. **`LoginDto` `@MinLength(8)`** — added alongside existing `@MaxLength(1024)`.
6. **`NEXT_PUBLIC_API_KEY` removed** from `frontend/.env.example` (no references remain).
7. **SMTP `config.getOrThrow()`** — `SmtpEmailService` now uses `getOrThrow()` for `SMTP_USER`/`SMTP_PASS` (EmailModule factory already guards before instantiation).

**Types added:**
- `JwtPayload.iat` — added `iat?: number` to shared interface for blocklist comparison.

**Fixed test:**
- `auth.service.spec.ts` — added `REDIS_CLIENT` mock (mockRedis with `setex`, `get`).

**Documentation updated:**
- `README.md` — "Auth — TODO" replaced with implementation summary; feature walkthrough step 0 (register/login) added.
- `docs/02-feature-breakdown.md` — F5.1 tasks marked done with audit reference.
- `TASKS.md` — all SEC-20260724-2 items marked done; SP13 cleanup cited and closed.

### Test results
150 tests pass, 18 suites, 0 failed. Frontend type-check clean.

### Still pending (manual / user input)
- SP15 regression proof — requires manual branch push + CI run
- Stream 401 confirmation — requires dev server restart
- F5.3 browser test — requires Docker + dev server
- F5.4 deploy — user must confirm public hostname + HTTPS strategy (Caddy vs Certbot)

---
## Session 20260724-130656-006 — 2026-07-24 13:20
**Branch:** ai/session-20260724-130656-006
**Duration:** 13m 17s
**Status:** ✅ Completed
**Tasks:** 54 done, 15 pending
**Handover:** .ai/handover-20260724-130656-006.md
