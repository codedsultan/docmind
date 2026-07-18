# syntax=docker/dockerfile:1
# Build context: MONOREPO ROOT (context: . in ci-cd.yml)

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY backend/package.json ./backend/package.json
COPY backend/prisma ./backend/prisma
RUN pnpm install --frozen-lockfile --filter docmind-api...

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate
RUN npx nest build
RUN test -f dist/src/main.js || (echo "ERROR: dist/src/main.js not found" && exit 1)
RUN pnpm prune --prod --ignore-scripts

FROM node:22-alpine AS app
RUN apk add --no-cache dumb-init wget
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=build --chown=nestjs:nodejs /app/backend/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/backend/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/backend/package.json ./package.json
COPY --from=build --chown=nestjs:nodejs /app/backend/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/backend/prisma.config.ts ./prisma.config.ts

USER nestjs
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('http').get('http://localhost:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main.js"]