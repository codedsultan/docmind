# InnerMind — Infra

Ansible-based deployment for the InnerMind stack (NestJS API + Next.js web),
following the same conventions as `x-infra` / `x-infra-node`.

This repo deploys **one app** to the shared VPS. It assumes the platform
layer (Caddy, the shared `cluster_{env}_shared` Docker network, shared
Postgres/Redis) is already running on that VPS via the separate `x-infra`
platform repo. This repo does **not** re-run foundation/platform playbooks.

## Layout

```
infra/ansible/
├── ansible.cfg
├── requirements.yml
├── inventories/
│   ├── staging/
│   │   ├── hosts.ini
│   │   └── group_vars/all/
│   │       ├── foundation.yml   # shared paths, Caddy, cluster network
│   │       ├── app.yml          # InnerMind app definition (api+web)
│   │       └── vault.yml        # encrypted secrets
│   └── production/              # same shape
├── playbooks/
│   └── deploy.yml               # the only playbook you run directly
├── roles/
│   ├── app_env_innermind/       # renders .env for the api service
│   └── app_runtime_innermind/   # renders compose, pulls, deploys, migrates, health-checks
└── scripts/
    └── preflight.sh             # refuses to proceed if any vault.yml is unencrypted
```

## One app, two images, one deploy unit

InnerMind is modeled the same way `go-kutt` is modeled in `x-infra`: one
`app` entry, two separately built Docker images (`api`, `web`), rendered as
two services in a single `docker-compose.yml` on the server. Caddy only
routes to the `web` service (`app.public_service: web`); `web` talks to
`api` over the internal `cluster_{env}_shared` Docker network via
`API_BASE_URL_SERVER`.

## First-time setup

```bash
cd infra/ansible
ansible-galaxy collection install -r requirements.yml

# Set up the pre-commit hook that blocks committing an unencrypted vault.yml
cd ../..
./scripts/setup-hooks.sh
```

Fill in real values in both `vault.yml` placeholders, then encrypt them:

```bash
ansible-vault encrypt infra/ansible/inventories/staging/group_vars/all/vault.yml
ansible-vault encrypt infra/ansible/inventories/production/group_vars/all/vault.yml
```

Update the placeholder values in `hosts.ini`, `app.yml` (domains, registry
path), and `foundation.yml` to match your actual server/domains.

## Deploying manually

```bash
cd infra/ansible

# Staging
ansible-playbook playbooks/deploy.yml \
  -i inventories/staging/hosts.ini \
  -e deploy_env=staging \
  -e TAG=develop-<short-sha>

# Production
ansible-playbook playbooks/deploy.yml \
  -i inventories/production/hosts.ini \
  -e deploy_env=production \
  -e TAG=<short-sha>
```

You need VPN access to the VPS for this to work locally (see
`infra/ansible/inventories/*/hosts.ini` — hosts are reached over WireGuard,
not the public internet). In CI, the workflow brings up a temporary
WireGuard tunnel before running Ansible — see
`.github/workflows/ci-cd.yml`.

## What `deploy.yml` actually does

1. **`app_env_innermind`** — merges `app.env.base` → `app.env.derived` →
   Postgres connection vars (from `app.db`) → secrets (from
   `app.env.secret_map`, pulled from the vault) into one `.env` file at
   `/srv/apps/innermind-{env}/.env`. Fails loudly if a required key or
   secret is missing.
2. **`app_runtime_innermind`** — logs into GHCR, renders
   `docker-compose.yml` from `app.runtime.services`, pulls both images,
   brings the stack up, waits for the `api` container to be running, runs
   TypeORM migrations and (non-production only) seeds via
   `docker compose exec`, then polls `/health/ready` until the API reports
   its Postgres connection is actually working.
3. **Caddy route** — writes `/srv/proxy/apps/innermind-{env}.caddy`
   pointing at the `web` service, reloads Caddy.
4. **Verification** — curls the public HTTPS domain until it gets a
   real response.

## Naming convention

Everything is namespaced `innermind-{env}-{service}`:

- Containers: `innermind-staging-api`, `innermind-staging-web`
- App dir on server: `/srv/apps/innermind-staging/`
- Vault vars: `vault_innermind_jwt_secret`, `vault_pg_app_innermind_password`
- Caddy file: `/srv/proxy/apps/innermind-staging.caddy`

If you ever add a second app to this same VPS in its own repo, copy this
`infra/ansible/` folder, find-and-replace `innermind` → `<newapp>`, and
keep `foundation.yml` pointing at the same `/srv/apps` + `/srv/proxy` +
`cluster_{env}_shared` your other apps already use.
