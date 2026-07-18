# 🧠 DocMind

<p align="center">
  <a href="https://github.com/codedsultan/docmind/actions/workflows/ci.yml">
    <img src="https://github.com/codedsultan/docmind/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://codecov.io/gh/codedsultan/docmind">
    <img src="https://codecov.io/gh/codedsultan/docmind/branch/main/graph/badge.svg" alt="Codecov">
  </a>
  <a href="https://github.com/codedsultan/docmind/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/codedsultan/docmind" alt="License">
  </a>
  <a href="https://github.com/codedsultan/docmind/issues">
    <img src="https://img.shields.io/github/issues/codedsultan/docmind" alt="Issues">
  </a>
  <br>
  <img src="https://img.shields.io/badge/status-in%20progress-yellow?style=flat-square" alt="Status: in progress">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white" alt="NestJS">
  <img src="https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL_%2B_pgvector-316192?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL + pgvector">
  <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
</p>

**AI knowledge assistant with agentic actions — in progress.**

DocMind ingests documents into a hybrid retrieval index (pgvector + full-text) and answers questions over them through a chat interface, with an agent layer that can take scoped, audited actions (not just answer questions) once later phases land.

-Repo bootstrapped from the [`js-stack`](https://github.com/codedsultan/js-stack) template architecture (NestJS + Next.js 16 + Postgres/pgvector + Redis, pnpm monorepo).

See **[`CHANGELOG.md`](CHANGELOG.md)** for a running history of what's shipped.

> 🚧 Currently in early bootstrap. Nothing below reflects finished product behavior yet — treat this README as a map of where the repo is headed, not a changelog of what's shipped. It'll be filled out properly as a Phase 4 deliverable.

## Stack

```
docmind/
├── backend/          NestJS API — Postgres (pgvector) + Redis, Prisma, BullMQ, Swagger
├── frontend/         Next.js 16 App Router web app
├── docker-compose.yml  Full local stack for end-to-end testing
└── .github/workflows/
    ├── ci.yml          Test, lint, coverage, build — every push/PR to main/develop
    ├── build.yml        Build & push Docker images (api, worker, web) to GHCR
    └── deploy.yml        Reusable workflow: deploy to EC2 (staging/production)
```

## Local development

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose up --build
```

| Service        | URL                                 |
|----------------|--------------------------------------|
| Frontend       | http://localhost:3000                |
| Backend API    | http://localhost:4000/api            |
| Swagger docs   | http://localhost:4000/docs           |
| Health (live)  | http://localhost:4000/health         |
| Health (ready) | http://localhost:4000/health/ready   |
| Postgres       | localhost:5432 (docmind/docmind)     |
| Redis          | localhost:6379                       |

## CI/CD

Three-stage pipeline, split so each concern can be reasoned about (and fail) independently:

1. **`1. CI Gates`** — type-check, lint, test with coverage, build. Runs on every push/PR to `main`/`develop`.
2. **`2. Container Build`** — runs only after CI Gates succeeds; builds and pushes `api`, `worker`, and `web` images to `ghcr.io/codedsultan/docmind`, tagged by environment and short SHA.
3. **`3. Production / Staging Deploy`** — a reusable workflow, called from stage 2, that deploys over a WireGuard tunnel to EC2. Currently gated behind the `DEPLOY_ENABLED` repo variable until the server is provisioned — image builds succeed and publish independently of deploy readiness.

## Status

Bootstrap phase — repo scaffolding, CI/CD pipeline, and dev environment are being wired up before any DocMind-specific features land. See [`CHANGELOG.md`](CHANGELOG.md) for what's landed so far.