/**
 * Route Auth Audit — standing record of every /v1/ route and its auth status.
 * Update this block whenever routes are added or @Public() decorators change.
 *
 * GUARDED (JWT required — returns 401 without a valid Bearer token):
 *   POST   /v1/documents/upload
 *   GET    /v1/documents
 *   GET    /v1/documents/:id
 *   DELETE /v1/documents/:id
 *   POST   /v1/chat/query
 *   POST   /v1/chat/stream
 *   POST   /v1/agent/chat
 *   POST   /v1/agent/confirm
 *   GET    /v1/notes
 *   POST   /v1/notes
 *   GET    /v1/notes/:id
 *   PATCH  /v1/notes/:id
 *   DELETE /v1/notes/:id
 *   GET    /v1/tasks
 *   POST   /v1/tasks
 *   GET    /v1/tasks/:id
 *   PATCH  /v1/tasks/:id
 *   PATCH  /v1/tasks/:id/done
 *   DELETE /v1/tasks/:id
 *   GET    /v1/admin/traces
 *   GET    /v1/admin/traces/:id
 *   GET    /v1/admin/traces/:id/export
 *
 * PUBLIC (@Public() — no token required):
 *   GET    /                       (health check)
 *   GET    /hello
 *   GET    /health
 *   POST   /v1/auth/register
 *   POST   /v1/auth/login
 */

import { randomBytes } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ConfigModule } from '@nestjs/config';

describe('AuthGuard (e2e)', () => {
  let app: INestApplication<App>;
  let jwtToken: string;
  const testEmail = `e2e-${randomBytes(6).toString('hex')}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () => ({
              JWT_SECRET: 'test-jwt-secret-min-32-chars-long!!',
              GEMINI_API_KEY: 'placeholder',
              INTERNAL_API_KEY: 'placeholder',
              EMAIL_MODE: 'log',
            }),
          ],
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // Obtain a JWT by registering a fresh test account
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: testEmail, password: 'Password123!' })
      .expect(201);

    jwtToken = (res.body as { token: string }).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects all /v1/ routes with 401 when no auth header is present', async () => {
    const httpAdapter = app.getHttpAdapter();
    const router: { stack: unknown[] } = (
      httpAdapter.getInstance() as unknown as { _router: { stack: unknown[] } }
    )._router;
    const routes: { method: string; path: string }[] = [];

    router.stack.forEach((layer: unknown) => {
      const route = (layer as Record<string, unknown>).route as
        Record<string, unknown> | undefined;
      if (route) {
        const methods = Object.keys(route.methods as Record<string, boolean>);
        const path = route.path as string;
        if (!path.startsWith('/v1/')) return;
        // Skip public auth routes
        if (path === '/v1/auth/register' || path === '/v1/auth/login') return;

        methods.forEach((method) => {
          if (method !== '_all') {
            routes.push({ method: method.toUpperCase(), path });
          }
        });
      }
    });

    expect(routes.length).toBeGreaterThan(0);

    for (const route of routes) {
      let req: request.Test;
      switch (route.method) {
        case 'GET':
          req = request(app.getHttpServer()).get(route.path);
          break;
        case 'POST':
          req = request(app.getHttpServer()).post(route.path).send({});
          break;
        case 'PATCH':
          req = request(app.getHttpServer()).patch(route.path).send({});
          break;
        case 'DELETE':
          req = request(app.getHttpServer()).delete(route.path);
          break;
        default:
          req = request(app.getHttpServer()).get(route.path);
      }
      await req.expect(401);
    }
  });

  it('POST /v1/auth/register and GET / return non-401 (they are @Public())', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: `pub-${randomBytes(4).toString('hex')}@test.com`,
        password: 'Password123!',
      })
      .expect((res) => expect(res.status).not.toBe(401));

    await request(app.getHttpServer())
      .get('/')
      .expect((res) => expect(res.status).not.toBe(401));
  });

  it('rejects POST /v1/agent/confirm with 401 when no auth header', async () => {
    await request(app.getHttpServer())
      .post('/v1/agent/confirm')
      .send({ confirmationToken: 'test-token' })
      .expect(401);
  });

  it('allows access with valid JWT on a known guarded route', async () => {
    await request(app.getHttpServer())
      .get('/v1/documents')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
  });
});
