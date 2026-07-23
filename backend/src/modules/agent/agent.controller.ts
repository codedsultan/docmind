import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Logger,
  Optional,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Observable, Subject } from 'rxjs';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { DEV_USER_ID } from '../../common/constants';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { AgentService } from './agent.service';
import type { AgentSseEvent } from './agent-sse.types';

export class AgentChatDto {
  @ApiProperty({
    description: 'User query for the agent',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  query!: string;
}

export class ConfirmDto {
  @ApiProperty({ description: 'Confirmation token from a ToolProposal' })
  @IsString()
  confirmationToken!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  queryId?: string;
}

interface SseMessage {
  data: string;
}

@ApiTags('agent')
@Controller('v1/agent')
@UseGuards(AuthGuard)
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly toolRegistry: ToolRegistryService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  @Post('chat')
  @Sse()
  @ApiOperation({ summary: 'Run the agent and stream events over SSE' })
  @ApiBody({ type: AgentChatDto })
  @ApiResponse({ status: 200, description: 'SSE event stream' })
  chat(@Body() dto: AgentChatDto, @Req() req: Request): Observable<SseMessage> {
    const userId =
      (req as unknown as { userId?: string }).userId ?? DEV_USER_ID;
    const subject = new Subject<SseMessage>();

    void this.agentService
      .run(dto.query, userId, (event: AgentSseEvent) => {
        subject.next({ data: JSON.stringify(event) });
        if (event.type === 'done' || event.type === 'error') {
          subject.complete();
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Agent error';
        subject.next({ data: JSON.stringify({ type: 'error', data: msg }) });
        subject.complete();
      });

    return subject.asObservable();
  }

  @Post('confirm')
  @ApiOperation({
    summary: 'Confirm and execute a proposed external-write tool call',
  })
  @ApiBody({ type: ConfirmDto })
  @ApiResponse({ status: 200, description: 'Tool executed and audit written' })
  @ApiResponse({ status: 400, description: 'Token expired or already used' })
  async confirm(
    @Body() dto: ConfirmDto,
    @Req() req: Request,
  ): Promise<{ result: unknown }> {
    if (!dto.confirmationToken) {
      throw new BadRequestException('confirmationToken is required');
    }

    const userId =
      (req as unknown as { userId?: string }).userId ?? DEV_USER_ID;

    const result = await this.toolRegistry.executeConfirmed(
      dto.confirmationToken,
      { userId, queryId: dto.queryId },
    );

    return { result };
  }
}
