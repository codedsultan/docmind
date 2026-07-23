/**
 * Eval fixture seeder.
 *
 * Reads pre-computed embeddings from eval/fixtures/postgres-overview-embedded.json
 * and inserts them into the database. Does NOT call any embedding API.
 *
 * Idempotent: skips if a document with the same contentHash already exists.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEV_USER_ID } from '../src/common/constants';
import { REDIS_CLIENT } from '../src/redis/redis.module';
import type Redis from 'ioredis';

interface EmbeddedChunk {
  content: string;
  embedding: number[];
}

interface EmbeddedFixture {
  chunks: EmbeddedChunk[];
}

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures/postgres-overview-embedded.json',
);
const QUERY_EMBEDDINGS_PATH = path.join(
  __dirname,
  'fixtures/query-embeddings.json',
);
const DOC_TITLE = 'PostgreSQL Overview (eval fixture)';
const SOURCE_TYPE = 'txt';
const EMBED_CACHE_TTL = 86400; // 24h

export async function seedEvalFixtures(
  app: INestApplicationContext,
): Promise<void> {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      `Pre-computed fixture not found: ${FIXTURE_PATH}\n` +
        '  Run: cd backend && ts-node -r tsconfig-paths/register eval/scripts/precompute-embeddings.ts',
    );
  }

  const fixture = JSON.parse(
    fs.readFileSync(FIXTURE_PATH, 'utf-8'),
  ) as EmbeddedFixture;

  const prisma = app.get(PrismaService);

  const contentHash = createHash('sha256')
    .update(DOC_TITLE + ':eval-fixture')
    .digest('hex');

  const existing = await prisma.document.findFirst({
    where: { userId: DEV_USER_ID, contentHash },
    select: { id: true },
  });

  if (existing) {
    console.log(
      `[seed] Eval fixture already seeded (documentId=${existing.id}), skipping.`,
    );
  } else {
    const doc = await prisma.document.create({
      data: {
        userId: DEV_USER_ID,
        title: DOC_TITLE,
        contentHash,
        sourceType: SOURCE_TYPE as never,
        visibility: 'private' as never,
        status: 'ready' as never,
      },
    });

    console.log(`[seed] Created eval Document id=${doc.id}`);

    for (let i = 0; i < fixture.chunks.length; i++) {
      const { content, embedding } = fixture.chunks[i];
      const chunkHash = createHash('sha256').update(content).digest('hex');
      const vectorLiteral = `[${embedding.join(',')}]`;

      await prisma.$executeRaw`
        INSERT INTO chunks (id, "documentId", content, "contentHash", "chunkIndex", embedding, "createdAt")
        VALUES (
          gen_random_uuid(),
          ${doc.id},
          ${content},
          ${chunkHash},
          ${i},
          ${vectorLiteral}::vector,
          NOW()
        )
        ON CONFLICT ("documentId", "contentHash") DO NOTHING
      `;
    }

    console.log(
      `[seed] Inserted ${fixture.chunks.length} chunks for eval fixture.`,
    );
  }

  // Seed pre-computed query embeddings into Redis (always runs, replaces any stale cache)
  await seedQueryEmbeddings(app);
}

async function seedQueryEmbeddings(
  app: INestApplicationContext,
): Promise<void> {
  if (!fs.existsSync(QUERY_EMBEDDINGS_PATH)) {
    console.warn(
      '[seed] Pre-computed query embeddings not found, skipping Redis seed.\n' +
        `       Run: cd backend && ts-node -r tsconfig-paths/register eval/scripts/precompute-query-embeddings.ts`,
    );
    return;
  }

  let redis: Redis | null = null;
  try {
    redis = app.get(REDIS_CLIENT) as Redis | null;
  } catch {
    // Redis client not available — eval falls back to live embedding
    return;
  }

  if (!redis) return;

  try {
    const queryEmbeddings = JSON.parse(
      fs.readFileSync(QUERY_EMBEDDINGS_PATH, 'utf-8'),
    ) as Record<string, number[]>;

    let count = 0;
    for (const [normalizedQuery, embedding] of Object.entries(
      queryEmbeddings,
    )) {
      const cacheKey = `embed:${createHash('sha256').update(normalizedQuery).digest('hex')}`;
      await redis.setex(cacheKey, EMBED_CACHE_TTL, JSON.stringify(embedding));
      count++;
    }

    console.log(`[seed] Seeded ${count} query embeddings into Redis cache.`);
  } catch {
    console.warn(
      '[seed] Redis cache seed failed (Redis may be unreachable). Eval will attempt live embedding.\n' +
        '       If a GEMINI_API_KEY is not available, provide a valid key or ensure Redis is reachable.',
    );
  }
}
