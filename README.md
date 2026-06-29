# InnerMind

Fullstack starter: **NestJS** API + **Next.js** web app, in one repo, with
its own **Ansible**-based deployment to a shared VPS.

```
innermind/
├── backend/          NestJS API (Postgres + Redis, TypeORM, Swagger)
├── frontend/         Next.js 16 App Router web app
├── infra/ansible/    Deployment — see infra/README.md
├── docker-compose.yml  Full local stack for end-to-end testing
└── .github/workflows/ci-cd.yml  CI/CD: test → build → push images → deploy
```

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
| Postgres       | localhost:5432 (innermind/innermind) |
| Redis          | localhost:6379                    |

The `migrate` service runs once on startup and applies TypeORM migrations
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
  (`http://innermind-staging-api:4000/api`), skipping Caddy entirely.

This mirrors the `API_BASE_URL_SERVER` convention used for the existing
`go-kutt` app in the shared infra repo, so the same mental model applies.

## CI/CD

`.github/workflows/ci-cd.yml`:

1. **Test & build** — backend and frontend run independently (type-check,
   lint, test with coverage, build). PRs and pushes to `main`/`develop`
   trigger this; nothing is deployed yet.
2. **Build & push images** — only on `workflow_dispatch` or a push to
   `develop`. Builds `backend/Dockerfile` → `ghcr.io/.../innermind/api` and
   `frontend/Dockerfile` → `ghcr.io/.../innermind/web`, tagged by
   environment and short SHA.
3. **Deploy** — brings up a temporary WireGuard tunnel to reach the VPN-only
   VPS, then runs `infra/ansible/playbooks/deploy.yml`, which renders the
   compose file, pulls both images, runs migrations, writes the Caddy
   route, and verifies the public domain responds.

`main` only deploys when you manually trigger the workflow and choose
`production` or `staging` — pushing to `main` alone does not deploy.
Pushing to `develop` auto-deploys to staging.

See `infra/README.md` for the full Ansible convention, required GitHub
secrets, and manual deploy commands.

## What's in the starter

- **Backend**: health checks (`/health`, `/health/ready`), a `users`
  module (entity + DTO + service + controller) wired to Postgres via
  TypeORM, Redis caching via `@nestjs/cache-manager`, rate limiting,
  Swagger at `/docs`, a runnable migration + seed script.
- **Frontend**: App Router, a server-rendered home page proving backend
  connectivity, a client-rendered `/users` page exercising a full
  create+list round trip, standalone Docker output for a minimal runtime
  image.
- **Infra**: see `infra/README.md`.

Extend `backend/src/modules/` and `frontend/src/app/` for real features —
the wiring (env validation, Docker, CI, Ansible) is already done.
