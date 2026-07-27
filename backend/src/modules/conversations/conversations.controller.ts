import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';

@ApiTags('conversations')
@Controller('v1/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's conversations" })
  list(@CurrentUser() user: JwtPayload) {
    return this.conversations.listForUser(user.sub);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get full message history for a conversation' })
  @ApiParam({ name: 'id' })
  getMessages(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.conversations.getMessages(user.sub, id);
  }
}
