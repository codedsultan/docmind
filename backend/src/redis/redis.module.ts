import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService): Redis => {
        const host = config.get<string>('REDIS_HOST') ?? 'localhost';
        const port = config.get<number>('REDIS_PORT') ?? 6399;
        const password = config.get<string>('REDIS_PASSWORD');
        // Local dev (docker-compose.yml) runs a plain, non-TLS Redis
        // container — REDIS_TLS is unset there, defaulting to false, so
        // `docker compose up` locally is untouched by this change.
        // Managed Redis providers (Upstash for our EC2 dev box,
        // ElastiCache with transit_encryption_enabled=true for
        // staging/production) are TLS-only and set REDIS_TLS=true in
        // their rendered .env (see docmind-infra-develop's env.dev.j2 /
        // env.prod.j2) — without this, they reset the connection
        // (ECONNRESET) since ioredis defaults to plain TCP.
        const tlsEnabled = config.get<string>('REDIS_TLS') === 'true';
        return new Redis({
          host,
          port,
          password: password || undefined,
          lazyConnect: true,
          ...(tlsEnabled ? { tls: {} } : {}),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule { }