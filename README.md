# 🚀 JS Stack

<p align="center">
  <a href="https://github.com/codedsultan/js-stack/actions/workflows/ci.yml">
    <img src="https://github.com/codedsultan/js-stack/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://codecov.io/gh/codedsultan/js-stack">
    <img src="https://codecov.io/gh/codedsultan/js-stack/branch/main/graph/badge.svg" alt="Codecov">
  </a>
  <a href="https://github.com/codedsultan/js-stack/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/codedsultan/js-stack" alt="License">
  </a>
  <a href="https://github.com/codedsultan/js-stack/stargazers">
    <img src="https://img.shields.io/github/stars/codedsultan/js-stack" alt="Stars">
  </a>
  <a href="https://github.com/codedsultan/js-stack/issues">
    <img src="https://img.shields.io/github/issues/codedsultan/js-stack" alt="Issues">
  </a>
  <br>
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white" alt="NestJS">
  <img src="https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/AWS_EC2-FF9900?style=flat-square&logo=amazon-aws&logoColor=white" alt="AWS EC2">
  <img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=github-actions&logoColor=white" alt="GitHub Actions">
</p>

## 📋 Table of Contents
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Development](#development)
- [Deployment](#deployment)
- [CI/CD](#cicd)
- [Contributing](#contributing)
- [License](#license)

Fullstack starter: **NestJS** API + **Next.js** web app, in one repo, with
automated **GitHub Actions CI/CD** pipeline deploying to **AWS EC2**.
```
jsstack/
├── backend/          NestJS API (Postgres + Redis, Prisma, Swagger)
├── frontend/         Next.js 16 App Router web app
├── docker-compose.yml  Full local stack for end-to-end testing
└── .github/workflows/ci.yml  CI: test → build → push images 
```


## ✨ Features

- **🚀 Fullstack TypeScript** - NestJS backend + Next.js frontend
- **📦 Monorepo** - Single repo with shared tooling
- **🧪 Testing** - Jest with Codecov coverage reporting
- **🐳 Docker** - Containerized development and production
- **🔄 CI/CD** - GitHub Actions automated pipeline to AWS EC2
- **📊 Monitoring** - Health checks, logging, and error tracking
- **🔒 Security** - Rate limiting, CORS, environment validation


## Quick start — run everything locally

This is the fastest way to prove the whole stack works end-to-end before
touching the VPS.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose up --build
```

| Service        | URL                              |
|----------------|-----------------------------------|
| Frontend       | http://localhost:3000             |
| Backend API    | http://localhost:4000/api         |
| Swagger docs   | http://localhost:4000/docs        |
| Health (live)  | http://localhost:4000/health      |
| Health (ready) | http://localhost:4000/health/ready|
| Postgres       | localhost:5432 (jsstack/jsstack) |
| Redis          | localhost:6379                    |

The `migrate` service runs once on startup and applies Prisma migrations
against Postgres before `api` is considered ready. Visit
`http://localhost:3000/users` to exercise a full create+list round trip
through the browser, and the home page (`/`) to confirm server-side
(Server Component) connectivity to the backend.

To reset the local database entirely:

```bash
docker compose down -v
docker compose up --build
```

## Local development without Docker

```bash
pnpm install   # installs both backend/ and frontend/ workspace packages

# Terminal 1 — needs Postgres + Redis reachable at localhost (e.g. via
# `docker compose up postgres redis`)
pnpm dev:backend

# Terminal 2
pnpm dev:frontend
```

## How the frontend talks to the backend

Two different base URLs are used depending on where the code runs — see
`frontend/src/lib/api.ts`:

- **Browser-side** (`'use client'` components, like `/users`): uses
  `NEXT_PUBLIC_API_URL`, baked into the JS bundle at *build time*. This
  must be a URL the browser can actually reach — the public domain in
  production, `localhost:4000` locally.
- **Server-side** (Server Components, like the home page health check):
  uses `API_BASE_URL_SERVER`, read at runtime. In Docker/production this
  points straight at the `api` container over the internal network
  (`http://jsstack-staging-api:4000/api`), skipping Caddy entirely.


## CI

`.github/workflows/ci.yml`:

1. **Test & build** — backend and frontend run independently (type-check,
   lint, test with coverage, build). PRs and pushes to `main`/`develop`
   trigger this; nothing is deployed yet.
2. **Build & push images** — only on `workflow_dispatch` or a push to
   `develop`. Builds `backend/Dockerfile` → `ghcr.io/.../jsstack/api` and
   `frontend/Dockerfile` → `ghcr.io/.../jsstack/web`, tagged by
   environment and short SHA.


`main` only deploys when you manually trigger the workflow and choose
`production` or `staging` — pushing to `main` alone does not deploy.
Pushing to `develop` auto-deploys to staging.


## What's in the starter

- **Backend**: health checks (`/health`, `/health/ready`), a `users`
  module (entity + DTO + service + controller) wired to Postgres via
  Prisma, Redis caching via `@nestjs/cache-manager`, rate limiting,
  Swagger at `/docs`, a runnable migration + seed script.
- **Frontend**: App Router, a server-rendered home page proving backend
  connectivity, a client-rendered `/users` page exercising a full
  create+list round trip, standalone Docker output for a minimal runtime
  image.


Extend `backend/src/modules/` and `frontend/src/app/` for real features —
the wiring (env validation, Docker, CI) is already done.

## TODO

1. Swagger docs
2. User Module with auth and Dashboard
3. CD via Terraform
4. K8s
5. Rate Limiting
6. Caching
