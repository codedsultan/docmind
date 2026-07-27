/**
 * Ownership integration test.
 *
 * Spins up a real Postgres container, boots the full NestJS HTTP server,
 * registers two users, creates resources owned by userA, and asserts that
 * userB's JWT is denied access (404 — ownership scoping, not 403 role check).
 *
 * No mocked PrismaService — a mock would pass even if the userId filter were
 * accidentally dropped from a query.
 *
 * Run: pnpm test:integration
 */

// ── Module-level env vars ──────────────────────────────────────────
// @nestjs/config v4 forRoot() runs at module load time (when AppModule
// is imported below), so these must be set BEFORE the import to pass
// ConfigModule validation. Actual values (testcontainer port, etc.) are
// overwritten in beforeAll.
process.env['DATABASE_URL'] =
  'postgresql://placeholder:placeholder@localhost:9999/placeholder';
process.env['REDIS_HOST'] = 'localhost';
process.env['REDIS_PORT'] = '6399';
process.env['REDIS_URL'] = 'redis://localhost:6399';
process.env['JWT_SECRET'] = 'ownership-test-secret-min-32-chars-ok';
process.env['GEMINI_API_KEY'] = 'placeholder';
process.env['INTERNAL_API_KEY'] = 'placeholder';
process.env['EMAIL_MODE'] = 'log';

import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Ownership (real Postgres, requires Docker)', () => {
  let container: StartedTestContainer;
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let tokenA: string;
  let tokenB: string;

  let noteId: string;
  let taskId: string;
  let documentId: string;

  beforeAll(async () => {
    // ── 1. Start a throwaway Postgres container ──────────────────────────────
    container = await new GenericContainer('pgvector/pgvector:pg16')
      .withEnvironment({
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'docmind_own_test',
      })
      .withWaitStrategy(
        Wait.forLogMessage('database system is ready to accept connections', 2),
      )
      .withExposedPorts(5432)
      .start();

    const port = container.getMappedPort(5432);
    const dbUrl = `postgresql://postgres:test@localhost:${port}/docmind_own_test`;
    process.env['DATABASE_URL'] = dbUrl;

    // ── 2. Run migrations against the fresh DB ───────────────────────────────
    const backendDir = __dirname.includes('/backend/')
      ? __dirname.split('/backend/')[0] + '/backend'
      : process.cwd();

    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: dbUrl },
    });

    // ── 3. Boot the full HTTP app ─────────────────────────────────────────────
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // ── 4. Register two distinct users ───────────────────────────────────────
    const emailA = `owner-${randomBytes(4).toString('hex')}@test.com`;
    const emailB = `other-${randomBytes(4).toString('hex')}@test.com`;

    const resA = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: emailA, password: 'Password123!' })
      .expect(201);
    tokenA = (resA.body as { token: string }).token;

    const resB = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: emailB, password: 'Password123!' })
      .expect(201);
    tokenB = (resB.body as { token: string }).token;

    // ── 5. Create resources owned by userA ───────────────────────────────────
    const noteRes = await request(app.getHttpServer())
      .post('/v1/notes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Private note by A' })
      .expect(201);
    noteId = (noteRes.body as { id: string }).id;

    const taskRes = await request(app.getHttpServer())
      .post('/v1/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Private task by A' })
      .expect(201);
    taskId = (taskRes.body as { id: string }).id;

    // Create a document directly (upload endpoint needs file + queue)
    const userARecord = await prisma.user.findFirst({
      where: { email: emailA },
    });
    const doc = await prisma.document.create({
      data: {
        userId: userARecord!.id,
        title: 'User A document',
        contentHash: `ch-${randomBytes(8).toString('hex')}`,
        sourceType: 'txt',
        visibility: 'private',
        status: 'ready',
      },
    });
    documentId = doc.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, 30_000);

  describe('Note ownership', () => {
    it('userA can read their own note', async () => {
      await request(app.getHttpServer())
        .get(`/v1/notes/${noteId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('userB gets 404 on userA note GET', async () => {
      await request(app.getHttpServer())
        .get(`/v1/notes/${noteId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('userB gets 404 on userA note PATCH', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/notes/${noteId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ content: 'hijacked' })
        .expect(404);
    });

    it('userB gets 404 on userA note DELETE', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/notes/${noteId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('Task ownership', () => {
    it('userA can read their own task', async () => {
      await request(app.getHttpServer())
        .get(`/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('userB gets 404 on userA task GET', async () => {
      await request(app.getHttpServer())
        .get(`/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('userB gets 404 on userA task PATCH', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'hijacked' })
        .expect(404);
    });

    it('userB gets 404 on userA task DELETE', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('Document ownership', () => {
    it('userA can read their own document', async () => {
      await request(app.getHttpServer())
        .get(`/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('userB gets 404 on userA document GET', async () => {
      await request(app.getHttpServer())
        .get(`/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('userB gets 404 on userA document DELETE', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('List isolation', () => {
    it('userB document list does not include userA documents', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/documents')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const ids = (res.body as Array<{ id: string }>).map((d) => d.id);
      expect(ids).not.toContain(documentId);
    });

    it('userB note list does not include userA notes', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/notes')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const ids = (res.body as Array<{ id: string }>).map((n) => n.id);
      expect(ids).not.toContain(noteId);
    });

    it('userB task list does not include userA tasks', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tasks')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).not.toContain(taskId);
    });
  });
});
