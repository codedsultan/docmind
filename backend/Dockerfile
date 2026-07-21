# syntax=docker/dockerfile:1
# Build context: MONOREPO ROOT 

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# --- Stage 1: Install Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY backend/package.json ./backend/package.json
COPY backend/prisma ./backend/prisma
RUN pnpm install --frozen-lockfile --filter docmind-api...

# --- Stage 2: Compile Application ---
FROM base AS build
# Bring in workspace manifests so pnpm commands work in this stage
COPY --from=deps /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./

# Bring in dependencies from the deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Bring in source files (Relies heavily on .dockerignore to skip host node_modules/dist)
COPY backend ./backend

WORKDIR /app/backend
RUN npx prisma generate
RUN npx nest build
RUN test -f dist/src/main.js || (echo "ERROR: dist/src/main.js not found" && exit 1)

# Prune dev dependencies from the entire workspace structure
WORKDIR /app
RUN CI=true pnpm prune --prod --ignore-scripts

# --- Stage 3: Minimal Production Image ---
FROM node:22-alpine AS app
RUN apk add --no-cache dumb-init wget
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

# Copy the pruned root workspace store and backend modules
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/backend/node_modules ./backend/node_modules
COPY --from=build --chown=nestjs:nodejs /app/backend/dist ./backend/dist
COPY --from=build --chown=nestjs:nodejs /app/backend/package.json ./package.json
COPY --from=build --chown=nestjs:nodejs /app/backend/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/backend/prisma.config.ts ./prisma.config.ts

USER nestjs
EXPOSE 4500

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('http').get('http://localhost:4500/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
# Running from the workspace directory structure
CMD ["node", "backend/dist/src/main.js"]