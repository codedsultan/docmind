import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [ProvidersModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
