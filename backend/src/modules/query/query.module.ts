import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ProvidersModule } from '../providers/providers.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { QueryController } from './query.controller';

@Module({
  imports: [ProvidersModule, RetrievalModule],
  controllers: [QueryController],
  providers: [AuthGuard],
})
export class QueryModule {}
