import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BullModule } from '@nestjs/bullmq'; // 💡 Use bullmq package
import { ProvidersModule } from '../providers/providers.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { ParserService } from './parsers/parser.service';
import { ChunkerService } from './parsers/chunker.service';
import { IngestionProcessor } from './processors/ingestion.processor';

const QUEUE_NAME = process.env.QUEUE_INGESTION ?? 'ingestion';

@Module({
  imports: [
    MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
    // Ensure the token registered matches the dynamic processor name exactly
    BullModule.registerQueue({
      name: QUEUE_NAME,
    }),
    ProvidersModule,
  ],
  controllers: [IngestionController],
  providers: [
    AuthGuard,
    IngestionService,
    ParserService,
    ChunkerService,
    IngestionProcessor,
  ],
  exports: [IngestionService, ParserService, ChunkerService],
})
export class IngestionModule {}
