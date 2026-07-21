# Changelog

All notable changes to DocMind are logged here, phase by phase. This is the public-facing history — day-to-day working notes live in a local, gitignored session log used to drive AI-assisted development.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Repo bootstrapped from the [`js-stack`](https://github.com/codedsultan/js-stack) template architecture (NestJS + Next.js 16 + Postgres/pgvector + Redis, pnpm monorepo).
- Three-stage CI/CD pipeline: CI Gates → Container Build → Deploy (deploy currently gated off until the server is provisioned).
- Public-repo guardrails: `seeds/`, PDFs, and resume-shaped filenames gitignored; local-only docs for PRD/implementation plan.
- `docker-compose.prod.yml`: production-ready compose file with restart policies, named env files, and explicit non-default port bindings.
- Hand-written Prisma migrations: `0000_init_pgvector` (pgvector extension), `0001_document_schema` (`DocumentVisibility` enum + `documents` table).
- `DocumentVisibility` enum and `Document` model in Prisma schema (Phase 0 baseline — no vector column yet).
- Swagger UI wired at `/docs` via `@nestjs/swagger`.
- `cmd/dev-start.sh`: quick local dev startup helper (`docker compose up --build --wait`).

### Changed
- Renamed starter branding (`jsstack` → `docmind`) across package names, Docker Compose services, env files, and CI registry paths.
- `docker-compose.yml`: Postgres image swapped from `postgres:16-alpine` to `pgvector/pgvector:pg16`; added missing `migrate` one-shot service; fixed header comment port typo.
- `backend/.env.example`: corrected all non-default port values (`PG_PORT=5349`, `REDIS_PORT=6399`, `CORS_ORIGIN=http://localhost:3400`); added `DATABASE_URL`.

---