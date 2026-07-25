import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TraceController } from './trace.controller';
import { TraceService } from './trace.service';

@Module({
  imports: [PrismaModule],
  controllers: [TraceController],
  providers: [TraceService],
  exports: [TraceService],
})
export class TraceModule {}
