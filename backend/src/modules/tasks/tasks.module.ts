import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [PrismaModule],
  controllers: [TasksController],
  providers: [TasksService, AuthGuard],
  exports: [TasksService],
})
export class TasksModule {}
