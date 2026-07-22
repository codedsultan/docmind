import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ProvidersModule } from '../providers/providers.module';
import { ToolsModule } from '../tools/tools.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [ToolsModule, ProvidersModule, PrismaModule],
  controllers: [AgentController],
  providers: [AgentService, AuthGuard],
  exports: [AgentService],
})
export class AgentModule {}
