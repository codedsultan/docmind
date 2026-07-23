# syntax=docker/dockerfile:1
# Build context: MONOREPO ROOT (context: . in ci-cd.yml)
#
# Next.js standalone output in a pnpm monorepo: the standalone dir contains
# a full copy of all files needed to run the server. In a monorepo the output
# is at .next/standalone/ (root of standalone, not .next/standalone/frontend/).
# server.js lives at .next/standalone/frontend/server.js because Next writes
# it relative to the package root inside the monorepo output.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile --filter docmind-web...

FROM base AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG NEXT_PUBLIC_API_KEY=dev-api-key-change-in-production
ENV NEXT_PUBLIC_API_KEY=${NEXT_PUBLIC_API_KEY}

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY frontend ./frontend

WORKDIR /app/frontend
RUN pnpm build

FROM node:22-alpine AS app
RUN apk add --no-cache dumb-init wget
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# In a monorepo, Next standalone output structure is:
#   .next/standalone/          ← node_modules shared across packages
#   .next/standalone/frontend/ ← the actual app files + server.js
#   .next/static/              ← static assets
#   public/                    ← public assets
COPY --from=build --chown=nextjs:nodejs /app/frontend/public ./public
COPY --from=build --chown=nextjs:nodejs /app/frontend/.next/standalone/frontend ./
COPY --from=build --chown=nextjs:nodejs /app/frontend/.next/standalone/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/frontend/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:3000/ || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]