import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Logger,
  Optional,
  Post,
  Sse,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { ConversationsService } from '../conversations/conversations.service';
import { AgentService } from './agent.service';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
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

  @ApiProperty({
    required: false,
    description:
      'Existing conversation to continue. Omit to start a new conversation ' +
      '— the new id is returned via a conversation_started SSE event.',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class ConfirmDto {
  @ApiProperty({ description: 'Confirmation token from a ToolProposal' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
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
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly conversations: ConversationsService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('chat')
  @Sse()
  @ApiOperation({ summary: 'Run the agent and stream events over SSE' })
  @ApiBody({ type: AgentChatDto })
  @ApiResponse({ status: 200, description: 'SSE event stream' })
  chat(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AgentChatDto,
  ): Observable<SseMessage> {
    const subject = new Subject<SseMessage>();

    void (async () => {
      try {
        let conversationId = dto.conversationId;

        if (conversationId) {
          await this.conversations.assertOwnership(user.sub, conversationId);
        } else {
          const conversation = await this.conversations.create(user.sub);
          conversationId = conversation.id;
          subject.next({
            data: JSON.stringify({
              type: 'conversation_started',
              data: { conversationId },
            }),
          });
        }

        await this.agentService.run(
          dto.query,
          user.sub,
          conversationId,
          (event: AgentSseEvent) => {
            subject.next({ data: JSON.stringify(event) });
            if (event.type === 'done' || event.type === 'error') {
              subject.complete();
            }
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Agent error';
        subject.next({ data: JSON.stringify({ type: 'error', data: msg }) });
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post('confirm')
  @ApiOperation({
    summary: 'Confirm and execute a proposed external-write tool call',
  })
  @ApiBody({ type: ConfirmDto })
  @ApiResponse({ status: 200, description: 'Tool executed and audit written' })
  @ApiResponse({ status: 400, description: 'Token expired or already used' })
  async confirm(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmDto,
  ): Promise<{ result: unknown }> {
    if (!dto.confirmationToken) {
      throw new BadRequestException('confirmationToken is required');
    }

    const result = await this.toolRegistry.executeConfirmed(
      dto.confirmationToken,
      { userId: user.sub, queryId: dto.queryId },
    );

    return { result };
  }
}
