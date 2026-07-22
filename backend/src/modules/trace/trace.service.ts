import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateTraceDto {
  userId: string;
  query: string;
  retrievedChunks?: unknown;
  provider: string;
  model: string;
  latencyBreakdown: Record<string, number>;
  cacheFlags: { embeddingHit: boolean; answerHit: boolean };
  toolCallAuditIds?: string[];
}

interface TurnCompletedEvent {
  userId: string;
  queryId?: string;
  query: string;
  provider: string;
  model: string;
  latencyBreakdown: Record<string, number>;
  cacheFlags?: { embeddingHit?: boolean; answerHit?: boolean };
  toolCallAuditIds?: string[];
}

@Injectable()
export class TraceService {
  private readonly logger = new Logger(TraceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTrace(data: CreateTraceDto) {
    return this.prisma.queryTrace.create({
      data: {
        userId: data.userId,
        query: data.query,
        retrievedChunks: data.retrievedChunks ?? [],
        provider: data.provider,
        model: data.model,
        latencyBreakdown: data.latencyBreakdown,
        cacheFlags: data.cacheFlags,
        toolCallAuditIds: data.toolCallAuditIds ?? [],
      },
    });
  }

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.queryTrace.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.queryTrace.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string) {
    return this.prisma.queryTrace.findUnique({ where: { id } });
  }

  @OnEvent('TurnCompleted')
  async onTurnCompleted(event: TurnCompletedEvent): Promise<void> {
    try {
      await this.createTrace({
        userId: event.userId,
        query: event.query,
        provider: event.provider,
        model: event.model,
        latencyBreakdown: event.latencyBreakdown,
        cacheFlags: {
          embeddingHit: event.cacheFlags?.embeddingHit ?? false,
          answerHit: event.cacheFlags?.answerHit ?? false,
        },
        toolCallAuditIds: event.toolCallAuditIds ?? [],
      });
    } catch (err) {
      this.logger.error('Failed to write QueryTrace', err);
    }
  }
}
