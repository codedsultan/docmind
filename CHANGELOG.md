# Changelog

All notable changes to DocMind are logged here, phase by phase. This is the public-facing history — day-to-day working notes live in a local, gitignored session log used to drive AI-assisted development.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Polish + CI — 2026-07-23

### Added

#### Eval Harness (F4.0-A, F4.0-B, F4.1-A)
- `backend/eval/retrieval.json` — replaced 3-case threshold-0.0 placeholder with the full 18-case eval set (migrated from `eval/retrieval.json`) targeting `postgres-overview.txt`. Thresholds: hit@5 ≥ 0.75, MRR ≥ 0.60.
- `backend/eval/run-eval.ts` — rewritten to use the `question`/`expectedSnippets`/`thresholds` schema: bootstraps the NestJS app context, runs `RetrievalService.retrieve()` per case, checks each returned chunk's `content` against `expectedSnippets` for hit@k, computes MRR, logs a per-case table, and exits non-zero when either metric falls below the file's thresholds.
- `backend/eval/seed.ts` — idempotent seeder: reads pre-computed embeddings from `backend/eval/fixtures/postgres-overview-embedded.json`, creates a `Document` row and inserts chunks via `$executeRaw` (no live embedding API call). Runs before eval cases in CI and locally.
- `backend/eval/scripts/precompute-embeddings.ts` — one-off script that chunks `postgres-overview.txt` using `ChunkerService` parameters and embeds each chunk via Gemini `gemini-embedding-001` (768d); output committed as `backend/eval/fixtures/postgres-overview-embedded.json` (6 chunks, 768-element arrays).
- `backend/eval/fixtures/postgres-overview.txt` — eval fixture document (public domain PostgreSQL overview, no personal content).
- Root `package.json` `pnpm eval` script updated from the HTTP-based runner to `pnpm --filter docmind-api eval`, delegating to the NestJS-bootstrap runner. Old `backend/scripts/eval-retrieval.ts` (HTTP-based, required a running server) deleted.
- `eval-retrieval` CI job in `.github/workflows/ci.yml` — runs after `test-backend`; spins up `pgvector/pgvector:pg16` as a service container (port 5349), deploys migrations, seeds pre-computed fixtures (no live embedding call), runs `pnpm --filter docmind-api eval`, exits non-zero on threshold miss, blocks merge to `main`/`develop`.

#### Real Postgres Integration Test (F4.0-C)
- `testcontainers` installed as a devDependency.
- `backend/src/modules/ingestion/processors/ingestion.integration.spec.ts` — implemented (removed `describe.skip`): spins up `pgvector/pgvector:pg16` via `GenericContainer`, runs `prisma migrate deploy`, creates a `Document` row, inserts a `Chunk` with a known 768-dim vector via `$executeRaw`, calls `RetrievalService.retrieve()`, and asserts the returned chunk's `documentId` matches and `fusedScore > 0`. Teardown stops the container.
- `test:integration` script added to `backend/package.json` — runs the integration spec in isolation (`--testPathPattern=integration --runInBand`). Excluded from the unit test regex so `pnpm test` remains fast (140 unit tests across 17 suites, 1 integration test separately).

#### FallbackGenerationProvider (F4.3)
- `FallbackGenerationProvider` — wraps a primary and a secondary `GenerationProvider`; on 429, 5xx, or request timeout from the primary, logs the failure (warn-level, provider name + error code), emits a `ProviderFallback` event, and delegates to the secondary. Implements both `generate()` and `generateStream()` paths.
- `ProvidersModule` now builds the fallback wrapper when both `GEMINI_API_KEY` and `GROQ_API_KEY` are available; falls back to primary-only binding otherwise.
- `providerFallback: Boolean` field added to `QueryTrace` (migration `0009_provider_fallback`). `CreateTraceDto` and `TurnCompletedEvent` carry the flag; `TraceService` writes it on every turn.
- **Limitation (documented in README):** fallback applies to generation only. Embedding fallback is omitted in V1 — Gemini and Groq produce different embedding spaces, so using one provider's embeddings against the other's HNSW index produces meaningless similarity scores. A cross-model re-embedding step would be required to extend fallback to embeddings.

#### README Rewrite (F4.2-A)
- `README.md` fully rewritten for a public portfolio audience:
  - Product description with the technically interesting choices called out explicitly.
  - Mermaid architecture diagram showing the full request path: Next.js 16 → NestJS API → BullMQ → Postgres/pgvector + Redis, plus the agent layer (LangGraph.js `StateGraph` → `ToolRegistry` → tier-dispatched tools).
  - Feature walkthrough matching the PRD Section 9 demo script (upload, retrieve with citations, save-note via agent, send-email-digest with confirmation card, trace viewer).
  - Stack table with a "why" column for each technology.
  - Local development setup with correct non-standard ports (frontend 3400, backend 4500, Postgres 5349, Redis 6399) and a note explaining why they differ from defaults.
  - "How this scales" section describing (without building) tool-registry generation from OpenAPI spec, OTel distributed tracing, and the multi-tenant auth swap path (DEV_USER_ID → Phase 5 JWT).
  - No personal data in any example, command, or diagram.

### Fixed

#### Security hardening (SEC-010-1 through SEC-010-7)
- **SEC-010-1** — Confirmation tokens now bind to `userId` in Redis. `ToolRegistryService.dispatchExternalWrite` stores `{ toolName, params, userId }`. `executeConfirmed` asserts `parsed.userId === ctx.userId` and throws `ForbiddenException` on mismatch — prevents cross-user token replay.
- **SEC-010-2** — Removed `|| true` from the `pnpm audit` step in CI; dependency vulnerabilities at `--audit-level=high` now fail the build.
- **SEC-010-3** — `send_email_digest` tool response no longer echoes the recipient address back through the agent context.
- **SEC-010-4** — External-write proposal dispatch now guards against Redis unavailability: throws `ServiceUnavailableException` instead of silently losing the proposal.
- **SEC-010-5** — `SmtpEmailService` added as a concrete `EmailService` implementation; `EMAIL_MODE` env var (`log` | `smtp`) selects between `EmailLogService` (console, default) and `SmtpEmailService` (live send via configured SMTP credentials).
- **SEC-010-6** — Provider API error logs no longer include the raw response body; error code and HTTP status only, preventing accidental leakage of API error payloads.
- **SEC-010-7** — Added `@MaxLength(200)` to `dueAt` DTO fields and `@IsUUID()` to `ConfirmAgentActionDto.queryId`.

### Tests
- Cross-user confirmation rejection: generate a proposal for `userA`, attempt `executeConfirmed` with `userB`'s context, assert `ForbiddenException`.
- Integration test: chunk insert + vector retrieval round-trip against real `pgvector/pgvector:pg16` container (testcontainers).
- `send-email-digest.tool.spec.ts` updated for SEC-010-3 (recipient not in response) and SEC-010-4 (Redis unavailable path).
- Total: 140 unit tests (17 suites) + 1 integration test.

---

## Phase 3 Stabilisation (SP8–SP13) — 2026-07-22

### Auth guard hardening (SP8)
- `AuthGuard` applied at the class level in `AgentController`, `NotesController`, `TasksController`, and `TraceController` — every route under these controllers now requires a valid `Authorization: Bearer <key>` header.
- `AuthGuard` added to the `providers` list in each corresponding NestJS module so the DI container can resolve it.
- E2E test `backend/test/auth-guard.e2e-spec.ts` dynamically iterates every registered `/v1/*` route and asserts it returns 401 without auth; explicitly covers `POST /v1/agent/confirm`.

### LangGraph StateGraph migration (SP9)
- `AgentService.run()` now builds a real `@langchain/langgraph` `StateGraph` per request: `modelTurn` node → conditional edge (`dispatch` / `finalAnswer`) → `toolDispatch` node → conditional edge (`loop` / `maxReached` / `proposalPending`).
- SSE events are emitted by iterating the graph stream in `streamMode: "updates"`, one SSE event per node output, eliminating the manual `emit()` callback threading.
- The Redis confirmation-token mechanism (`ToolRegistryService.executeConfirmed`) is **kept** — it runs independently of LangGraph; pause-at-confirmation means the graph stream ends when a `ToolProposal` is detected, and resume is a separate `POST /agent/confirm` call.
- `@langchain/langgraph` was already installed; it is now actively used — no installed-but-unused dependency.

### parseModelOutput fence stripping (SP10)
- `AgentService.parseModelOutput()` now strips `\`\`\`json` and plain `\`\`\`` fences before attempting a JSON parse, so models that wrap their tool-call JSON in markdown blocks still trigger the correct tool dispatch.
- Malformed JSON (missing brace, trailing comma) is caught silently and treated as a final-answer text response; raw JSON is never surfaced to the user.
- Five new tests covering fenced JSON, plain-fence JSON, trailing-comma JSON, genuinely malformed JSON, and JSON-with-leading-prose.

### send_email_digest — deferred transactional send (SP12)
- **Decision (2026-07-22):** The portfolio demo does **not** wire a live transactional email provider. The `send_email_digest` tool delegates to `EmailLogService` which logs a formatted preview to the server console instead of sending. This is intentional and documented — the goal is to demonstrate risk-tiered tool dispatch and the propose → confirm → audit flow, not email delivery. When a real provider (Resend / Postmark) is needed, swap the `EMAIL_SERVICE` binding in `email.module.ts` to a concrete sender; no other code changes are required.

### Citation utility (SP13)
- `backend/src/modules/query/citation.util.ts` — shared `buildAllCitations()` and `parseCitations()` helpers extracted from `query.controller.ts` (which had an inline `parseCitations` method) and `query-documents.tool.ts` (which had duplicate inline citation mapping). Both callers now import from the shared module.

### Eval runner skeleton + integration test stub (SP11)
- `backend/eval/run-eval.ts` — NestJS-bootstrap eval runner scaffolded; `pnpm eval` wired in `backend/package.json`. Initial eval fixture had 3 placeholder cases with threshold 0.0 (DB-agnostic baseline). Superseded and replaced in Phase 4 (F4.0-A/B) with the real 18-case set and committed embeddings.
- `backend/src/modules/ingestion/processors/ingestion.integration.spec.ts` — integration test skeleton added as `describe.skip`; full implementation deferred to Phase 4 (F4.0-C) when `testcontainers` could be wired properly.

## Agentic Layer — 2026-07-22

### Added

#### Schema v2 (F3.1)
- `RiskTier` Prisma enum (`read`, `internal_write`, `external_write`) — shared with TypeScript via a `const RiskTier` mirror in `common/constants.ts`.
- `Note` model — `userId`, `content`, nullable `sourceQueryId` (links a note back to the query that triggered it), timestamps.
- `Task` model — `userId`, `title`, optional `description`, nullable `dueAt`, `done` flag, nullable `sourceQueryId`, timestamps.
- `ToolCallAudit` model — records every tool dispatch: `toolName`, `riskTier`, `params Json`, `result Json`, `confirmed` boolean, optional `error`; written on both success and failure paths, no exceptions.
- `QueryTrace` model — one row per user turn: `query`, `retrievedChunks Json` (chunk IDs + pre/post-rerank scores snapshot), `provider`, `model`, `latencyBreakdown Json` (embed/retrieve/rerank/generate ms), `cacheFlags Json` (embeddingHit, answerHit), `toolCallAuditIds String[]`.
- Hand-written migration `0008_agent_schema` — creates all four tables and the `RiskTier` DB enum; not generated by `prisma migrate dev`.

#### Tool Registry + Tier Enforcement (F3.2A)
- `Tool<TParams>` interface — `name`, `description`, `riskTier`, `schema` (Zod), `execute(params, ctx)`.
- `ToolContext` type — carries `userId` and optional `queryId` through every tool invocation.
- `ToolRegistryService.dispatch()` — single entrypoint enforcing tier semantics **in the registry, not per-tool**:
  - `read` → executes immediately, no audit row.
  - `internal_write` → executes + writes `ToolCallAudit`.
  - `external_write` → returns a `ToolProposal` (`{ type: 'proposal', toolName, preview, confirmationToken }`) and **never calls `execute`** on the first pass; params stored in Redis pending explicit confirmation.
- `ToolRegistryService.confirm()` — consumes a Redis confirmation token (5-min TTL, single-use via atomic `DEL`), calls `execute`, writes `ToolCallAudit` with `confirmed: true`; expired and reused tokens are rejected and audited.
- Unit tests prove `external_write` tools cannot be executed by the loop without a valid confirmation token, even if the model requests them directly.

#### LangGraph Agent Graph (F3.2B)
- `AgentService` — LangGraph.js orchestration loop: `modelTurn` node → `toolDispatch` node → back to `modelTurn` or `finalAnswer`; configurable max-iteration guard (`AGENT_MAX_ITERATIONS`, default 10) prevents infinite loops.
- `POST /api/v1/agent/chat` — SSE endpoint streaming typed agent events.
- `POST /api/v1/agent/confirm` — confirmation endpoint: validates token → executes tool → returns audit result.
- Extended SSE event set (discriminated union): `tool_call`, `tool_result`, `confirmation_required` added to Phase 2's `token`, `citations`, `done`, `error`.
- `TurnCompleted` event emitted from `AgentService` after each user turn for trace writes.

#### Read Tools (F3.3)
- `query_documents` (`riskTier: read`) — thin wrapper over `RetrievalService.retrieve()`; packages results as `{ citations: Citation[] }`; Zod schema: `{ query: string, topK?: number }`.
- `summarize_document` (`riskTier: read`) — loads up to 30 chunks for a `documentId`, summarizes via `GenerationProvider`; Zod schema: `{ documentId: string }`.
- Both tools produce `ToolCallAudit` rows via registry dispatch.

#### Internal-Write Tools + CRUD (F3.4)
- `save_note` (`riskTier: internal_write`) — creates a `Note` row tied to `userId` and optional `sourceQueryId`; Zod schema: `{ content: string, sourceQueryId?: string }`.
- `create_task` (`riskTier: internal_write`) — creates a `Task` row; natural-language `dueAt` parsed by `chrono-node`; Zod schema: `{ title: string, description?: string, dueAt?: string }`.
- `NotesService` / `NotesController` — full CRUD under `/api/v1/notes`, all queries userId-scoped.
- `TasksService` / `TasksController` — full CRUD under `/api/v1/tasks` + `PATCH /api/v1/tasks/:id/done` toggle, all queries userId-scoped.
- Frontend `/notes` — list view with inline edit and delete.
- Frontend `/tasks` — list view with done toggle, inline edit and delete.
- Both tools always produce `ToolCallAudit` rows; no confirmation required.

#### External-Write + Confirmation Flow (F3.5)
- `send_email_digest` (`riskTier: external_write`) — tool has **no recipient parameter**; recipient is exclusively `config.get('EMAIL_DIGEST_RECIPIENT')` (single config-sourced allowlist address, impossible to generalize via tool input).
- `EmailService` interface — `sendDigest(preview: string): Promise<void>`; dev implementation (`email-log.service.ts`) logs the rendered digest instead of sending; real transport bound when `EMAIL_MODE=send`.
- Proposal flow: `dispatch()` stores params in Redis (5-min TTL), returns `ToolProposal` with rendered preview and a UUID confirmation token.
- `POST /api/v1/agent/confirm` consumes the token atomically — token is deleted before execution (single-use); writes `ToolCallAudit` with `confirmed: true` on success; expired/reused tokens return 400 and are also audited.
- `ConfirmationCard` component — renders the digest preview inline in the chat stream; Confirm / Cancel buttons; cycles through pending → confirmed → sent UI states.
- Chat SSE hook updated to capture `confirmation_required` events and surface the card.

#### Traces + Admin Viewer (F3.6)
- `TraceService` — writes one `QueryTrace` per user turn via an `@OnEvent('TurnCompleted')` listener (not inline in the hot path).
- `GET /api/v1/admin/traces` — paginated list of traces.
- `GET /api/v1/admin/traces/:id` — detail including linked `ToolCallAudit` rows.
- Frontend `/admin/traces` — list view: query text, timestamp, total latency, cache hit flags, tool call count.
- Frontend `/admin/traces/[id]` — detail view: retrieved chunks with pre/post-rerank scores, timing waterfall (embed / retrieve / rerank / generate), tool calls with params and results expanded.

#### Tests
- `tool-registry.service.spec.ts` — tier enforcement: `external_write` never calls `execute`; `internal_write` writes audit row; `read` executes without audit; expired token rejected; reused token rejected.
- `agent.service.spec.ts` — `confirmation_required` event fires for `external_write` tools; audit rows present for every executed call (success and failure).
- `notes.service.spec.ts` / `tasks.service.spec.ts` — CRUD coverage including `chrono-node` date parsing and userId-scoped isolation.
- `trace.service.spec.ts` — `createTrace` and `onTurnCompleted` event listener.

## Retrieval Quality & Streaming — 2026-07-21

### Added

#### Retrieval Pipeline
- **Keyword search layer** (F2.1) — migration `0007_keyword_search` adds a `content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED` column and GIN index on `chunks`; `keywordSearch()` queries via `websearch_to_tsquery` with `$queryRaw` tagged templates (no string concatenation).
- **Hybrid fusion with RRF** (F2.2) — vector and keyword searches run in parallel; results fused via Reciprocal Rank Fusion (k=60, constant in `rrf.ts`); cosine similarity floor via `RETRIEVAL_SIMILARITY_THRESHOLD` env var (default 0.3) prevents low-quality vector matches from entering fusion.
- `RetrievedChunk` extended with `vectorScore`, `keywordScore`, and `fusedScore` fields; `similarity` retained as an alias for backward compat.
- `rrf.ts` — pure, side-effect-free RRF function; tested independently in `rrf.spec.ts` (ties, one-sided inputs, k sensitivity).
- **Re-ranking layer** (F2.3) — `Reranker` interface + `PassthroughReranker` default binding; top-20 fused candidates fed to reranker → top-K returned; interface is swappable without touching `RetrievalService`.
- **Scoped `retrieve()` API** (F2.4) — all filters (`userId`, `visibility`, `isActive`, `status`) applied in SQL on both vector and keyword paths; `fetchChunksByIds` also scoped; `QueryController` is the single retrieval SQL consumer in the codebase.

#### Citations
- **End-to-end citations** (F2.5) — `documents.title` joined in retrieval SQL; context block numbers chunks `[1]`, `[2]`…; `parseCitations()` maps `[N]` markers back to `RetrievedChunk`; `CitationDto` (`marker`, `chunkId`, `documentTitle`, `snippet`) on query and stream responses.
- Frontend renders `[N]` markers as inline superscript badges; hover/click reveals a tooltip popover with document title and 150-char snippet.

#### SSE Streaming
- **`POST /api/v1/chat/stream`** (F2.6) — NestJS `@Sse` endpoint backed by an RxJS `Observable`; emits sequenced events: `citations` (once retrieval completes, before first tokens), `token` (per provider chunk), `done`, `error`.
- Upstream provider stream cancelled on HTTP connection close via `req.on('close', ...)` — verified via server logs; no hanging provider requests on tab close.
- `useChatStream` hook (`frontend/src/hooks/useChatStream.ts`) — manages `EventSource` lifecycle, accumulates tokens, captures citations array, aborts on unmount / route navigation.
- Chat page switched to streaming with progressive token rendering, inline citation badges, and a Stop button that aborts the stream mid-flight.

#### Redis Caches
- **Embedding cache** (F2.7) — key `embed:{sha256(normalized query)}`, TTL 86 400 s; deterministic embeddings make this lossless and effectively permanent per query string.
- **Answer cache** (F2.7) — key `answer:{sha256(normalized query + sorted chunk IDs)}`, TTL 3 600 s; busts naturally when new content is ingested (chunk set changes → new key); applied on both the non-streaming query path and the SSE streaming path.
- Cache hit/miss logged at debug level (`[cache:hit]` / `[cache:miss]`).

#### Eval Harness
- **Eval set** (F2.8) — `eval/retrieval.json` with 18 `(question, expectedChunkContentHash)` pairs built against a committed Postgres documentation fixture (`eval/fixtures/postgres-overview.txt`); thresholds (`hitAtK: 0.75`, `mrr: 0.6`) stored in the JSON.
- **Eval runner** — `backend/scripts/eval-retrieval.ts` calls `RetrievalService.retrieve()` per case, computes hit@5 and MRR, prints a scorecard, exits non-zero under threshold.
- `pnpm eval` wired in root `package.json`.

#### Tests
- `rrf.spec.ts` — RRF math verified on synthetic rank lists: correct score ordering, tie handling, one-sided (vector-only / keyword-only) inputs, k-sensitivity.
- `retrieval.service.spec.ts` — hybrid retrieval integration cases: keyword path surfaces chunks the vector path ranks low; private doc excluded from `visibility: 'public'` queries; SQL scoping confirmed for userId, visibility, isActive, and status on both paths.
- `query.controller.spec.ts` — citation parsing, `CitationDto` shape, streaming event sequence, cache hit/miss paths.

### Changed
- Lint cleanup: fixed 65 ESLint errors (frontend + backend) — unsafe `any` assignments, unused imports, unhandled promises, `async`-without-`await` mocks, and `set-state-in-effect` violations.

## Ingestion & Basic Q&A — 2026-07-20

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
