import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { QueryModule } from './modules/query/query.module';
import * as Joi from 'joi';

const configValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().integer().required(),
  GEMINI_API_KEY: Joi.string().required(),
  PROVIDER: Joi.string().valid('gemini', 'groq').default('gemini'),
  INTERNAL_API_KEY: Joi.string().required(),
}).unknown(true);

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    QueuesModule,
    IngestionModule,
    ProvidersModule,
    RetrievalModule,
    QueryModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
