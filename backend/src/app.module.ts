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
import { ToolsModule } from './modules/tools/tools.module';
import { AgentModule } from './modules/agent/agent.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { NotesModule } from './modules/notes/notes.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TraceModule } from './modules/trace/trace.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import * as Joi from 'joi';

const configValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().integer().required(),
  GEMINI_API_KEY: Joi.string().required(),
  PROVIDER: Joi.string().valid('gemini', 'groq').default('gemini'),
  JWT_SECRET: Joi.string().min(32).required(),
  INTERNAL_API_KEY: Joi.string().optional(),
  EMAIL_DIGEST_RECIPIENT: Joi.string().email().optional(),
  EMAIL_MODE: Joi.string().valid('log', 'send').default('log'),
  AGENT_MAX_ITERATIONS: Joi.number().integer().min(1).max(50).default(10),
  CORS_ORIGIN: Joi.string().uri().optional().default('http://localhost:3400'),
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
    AuthModule,
    IngestionModule,
    ProvidersModule,
    RetrievalModule,
    QueryModule,
    ToolsModule,
    AgentModule,
    ConversationsModule,
    NotesModule,
    TasksModule,
    TraceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}
