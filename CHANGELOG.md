# Changelog

All notable changes to DocMind are logged here, phase by phase. This is the public-facing history — day-to-day working notes live in a local, gitignored session log used to drive AI-assisted development.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Repo bootstrapped from the [`js-stack`](https://github.com/codedsultan/js-stack) template architecture (NestJS + Next.js 16 + Postgres/pgvector + Redis, pnpm monorepo).
- Three-stage CI/CD pipeline: CI Gates → Container Build → Deploy (deploy currently gated off until the server is provisioned).
- Public-repo guardrails: `seeds/`, PDFs, and resume-shaped filenames gitignored; local-only docs for PRD/implementation plan.

### Changed
- Renamed starter branding (`jsstack` → `docmind`) across package names, Docker Compose services, env files, and CI registry paths.

---