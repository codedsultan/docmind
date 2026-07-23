/**
 * Real-database integration test for the ingestion → retrieval round-trip.
 *
 * Prerequisites:
 *   - Docker daemon running with `pgvector/pgvector:pg16` image available
 *   - `testcontainers` devDependency installed
 *
 * Run: pnpm test:integration   (separate from unit test suite)
 */

import { execSync } from 'child_process';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { DEV_USER_ID } from '../../../common/constants';

const VECTOR_DIM = 768;

function makeVector(hotDim: number): number[] {
  const v = new Array(VECTOR_DIM).fill(0) as number[];
  v[hotDim] = 1.0;
  return v;
}

describe('Ingestion → Retrieval integration (requires Docker)', () => {
  let container: StartedTestContainer;
  let prisma: PrismaService;
  let app: INestApplicationContext;

  beforeAll(async () => {
    container = await new GenericContainer('pgvector/pgvector:pg16')
      .withEnvironment({
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'docmind_test',
      })
      .withWaitStrategy(
        Wait.forLogMessage('database system is ready to accept connections', 2),
      )
      .withExposedPorts(5432)
      .start();

    const port = container.getMappedPort(5432);
    const dbUrl = `postgresql://postgres:test@localhost:${port}/docmind_test`;
    process.env['DATABASE_URL'] = dbUrl;

    const backendDir = __dirname.includes('/backend/')
      ? __dirname.split('/backend/')[0] + '/backend'
      : process.cwd();

    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: dbUrl },
    });

    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error'],
    });

    prisma = app.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, 30_000);

  it('inserts a chunk with a vector embedding and retrieves it by similarity', async () => {
    const contentHash = `integration-test-${Date.now()}`;

    const doc = await prisma.document.create({
      data: {
        userId: DEV_USER_ID,
        title: 'Integration Test Document',
        contentHash,
        sourceType: 'txt',
        visibility: 'private',
        status: 'ready',
      },
    });

    const content = 'PostgreSQL supports ACID transactions and MVCC.';
    const chunkHash = `chunk-${contentHash}`;
    const embedding = makeVector(42);
    const vectorLiteral = `[${embedding.join(',')}]`;

    await prisma.$executeRaw`
      INSERT INTO chunks (id, "documentId", content, "contentHash", "chunkIndex", embedding, "createdAt")
      VALUES (
        gen_random_uuid(),
        ${doc.id},
        ${content},
        ${chunkHash},
        0,
        ${vectorLiteral}::vector,
        NOW()
      )
    `;

    const retrieval = app.get(RetrievalService);
    const results = await retrieval.retrieve('ACID transactions PostgreSQL', {
      userId: DEV_USER_ID,
      topK: 1,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].documentId).toBe(doc.id);
    expect(results[0].fusedScore).toBeGreaterThan(0);
  });
});
