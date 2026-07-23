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
const DOC_TITLE = 'PostgreSQL Overview (eval fixture)';
const SOURCE_TYPE = 'txt';

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
    return;
  }

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
