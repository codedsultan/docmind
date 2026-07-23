import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TraceController } from './trace.controller';
import { TraceService } from './trace.service';

@Module({
  imports: [PrismaModule],
  controllers: [TraceController],
  providers: [TraceService, AuthGuard],
  exports: [TraceService],
})
export class TraceModule {}
