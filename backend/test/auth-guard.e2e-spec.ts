import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ConfigModule } from '@nestjs/config';

describe('AuthGuard (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ API_KEY: 'test-api-key' })],
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects all registered API routes with 401 when no auth header is present', async () => {
    const httpAdapter = app.getHttpAdapter();
    const router: { stack: unknown[] } = httpAdapter.getInstance()._router;
    const routes: { method: string; path: string }[] = [];

    router.stack.forEach((layer: unknown) => {
      const route = (layer as Record<string, unknown>).route as
        Record<string, unknown> | undefined;
      if (route) {
        const methods = Object.keys(route.methods as Record<string, boolean>);
        const path = route.path as string;
        // Exclude root health-check route and anything not under /v1/
        if (!path.startsWith('/v1/')) return;

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

  it('rejects POST /v1/agent/confirm with 401 when no auth header', async () => {
    await request(app.getHttpServer())
      .post('/v1/agent/confirm')
      .send({ confirmationToken: 'test-token' })
      .expect(401);
  });

  it('allows access with valid API key on a known guarded route', async () => {
    await request(app.getHttpServer())
      .get('/v1/documents')
      .set('Authorization', 'Bearer test-api-key')
      .expect(200);
  });
});
