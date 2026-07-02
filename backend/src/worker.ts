import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueuesModule } from './queues/queues.module';

// Minimal module — only boots queue processors, no HTTP server
@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        QueuesModule,
    ],
})
class WorkerAppModule { }

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(WorkerAppModule);
    app.enableShutdownHooks();
    console.log('🔧 Worker is running and consuming jobs...');
}

bootstrap();