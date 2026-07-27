import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChatMessage } from '../providers/generation.provider';
import { trimHistory } from './history.util';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string) {
    return this.prisma.conversation.create({ data: { userId } });
  }

  async listForUser(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Throws NotFoundException if the conversation doesn't exist or isn't owned by userId. */
  async assertOwnership(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }
  }

  /** Full raw message history for a conversation (for reload/display), ownership-checked. */
  async getMessages(userId: string, conversationId: string) {
    await this.assertOwnership(userId, conversationId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Loads and trims history for replay into the agent's `messages` state.
   * Caller is responsible for ownership checks (agent.chat already resolves
   * conversationId via the controller, which validates or creates it).
   */
  async loadHistory(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    const messages: ChatMessage[] = rows.map((r) => ({
      role: r.role,
      content: r.content,
    }));
    return trimHistory(messages);
  }

  async appendUserMessage(
    conversationId: string,
    content: string,
  ): Promise<void> {
    await this.appendMessage(conversationId, 'user', content);
  }

  async appendAssistantMessage(
    conversationId: string,
    content: string,
    citations?: unknown[],
  ): Promise<void> {
    await this.appendMessage(conversationId, 'assistant', content, citations);
  }

  private async appendMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    citations?: unknown[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          role,
          content,
          citations: citations
            ? (citations as Prisma.InputJsonValue)
            : undefined,
        },
      }),
      // Bump updatedAt so conversations sort by recent activity (used by
      // the future conversation-list sidebar).
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }
}
