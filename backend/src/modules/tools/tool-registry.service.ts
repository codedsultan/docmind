import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { Prisma } from '../../../generated/prisma/client';
import { RiskTier } from '../../common/constants';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { Inject } from '@nestjs/common';
import { Tool, ToolContext } from './tool.interface';
import { ToolProposal } from './tool-proposal.type';

/** TTL in seconds for confirmation tokens stored in Redis. */
const CONFIRM_TOKEN_TTL = 300;

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, Tool<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  register<T>(tool: Tool<T>): void {
    this.tools.set(tool.name, tool);
    this.logger.log(`Tool registered: ${tool.name} [${tool.riskTier}]`);
  }

  getTool(name: string): Tool<unknown> | undefined {
    return this.tools.get(name);
  }

  listTools(): Tool<unknown>[] {
    return [...this.tools.values()];
  }

  /**
   * Dispatch a tool call, enforcing tier semantics:
   *  - read           → execute immediately, no audit row
   *  - internal_write → execute + write ToolCallAudit row
   *  - external_write → store params in Redis, return ToolProposal (NO execute)
   */
  async dispatch(
    name: string,
    params: unknown,
    ctx: ToolContext,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException(`Tool "${name}" is not registered`);
    }

    const parsed = tool.schema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid params for tool "${name}": ${parsed.error.message}`,
      );
    }
    const validParams = parsed.data;

    if (tool.riskTier === RiskTier.read) {
      return tool.execute(validParams, ctx);
    }

    if (tool.riskTier === RiskTier.internalWrite) {
      return this.dispatchInternalWrite(tool, validParams, ctx);
    }

    // external_write: propose, never execute
    return this.dispatchExternalWrite(tool, validParams);
  }

  /** Execute an external_write proposal that was previously confirmed. */
  async executeConfirmed(
    confirmationToken: string,
    ctx: ToolContext,
  ): Promise<unknown> {
    if (!this.redis) {
      throw new BadRequestException('Confirmation requires Redis');
    }

    const key = `confirm:${confirmationToken}`;
    const raw = await this.redis.get(key);

    if (!raw) {
      await this.writeAudit({
        userId: ctx.userId,
        toolName: 'unknown',
        riskTier: 'external_write',
        params: { confirmationToken },
        confirmed: false,
        error: 'Token expired or already used',
      });
      throw new BadRequestException(
        'Confirmation token expired or already used',
      );
    }

    // Single-use: delete immediately
    await this.redis.del(key);

    const { toolName, params } = JSON.parse(raw) as {
      toolName: string;
      params: unknown;
    };

    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new NotFoundException(`Tool "${toolName}" no longer registered`);
    }

    let result: unknown;
    let error: string | undefined;
    try {
      result = await tool.execute(params, ctx);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    await this.writeAudit({
      userId: ctx.userId,
      toolName,
      riskTier: tool.riskTier,
      params,
      result,
      confirmed: true,
      error,
    });

    if (error) throw new Error(error);
    return result;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async dispatchInternalWrite(
    tool: Tool<unknown>,
    params: unknown,
    ctx: ToolContext,
  ): Promise<unknown> {
    let result: unknown;
    let error: string | undefined;

    try {
      result = await tool.execute(params, ctx);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    await this.writeAudit({
      userId: ctx.userId,
      toolName: tool.name,
      riskTier: tool.riskTier,
      params,
      result,
      confirmed: false,
      error,
    });

    if (error) throw new Error(error);
    return result;
  }

  private async dispatchExternalWrite(
    tool: Tool<unknown>,
    params: unknown,
  ): Promise<ToolProposal> {
    const confirmationToken = randomUUID();
    const preview = `[${tool.name}] ${JSON.stringify(params)}`;

    if (this.redis) {
      await this.redis.set(
        `confirm:${confirmationToken}`,
        JSON.stringify({ toolName: tool.name, params }),
        'EX',
        CONFIRM_TOKEN_TTL,
      );
    }

    return {
      type: 'proposal',
      toolName: tool.name,
      preview,
      confirmationToken,
    };
  }

  private async writeAudit(data: {
    userId: string;
    toolName: string;
    riskTier: string;
    params: unknown;
    result?: unknown;
    confirmed: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await this.prisma.toolCallAudit.create({
        data: {
          userId: data.userId,
          toolName: data.toolName,
          riskTier: data.riskTier as
            'read' | 'internal_write' | 'external_write',
          params: data.params as Prisma.InputJsonValue,
          result:
            data.result !== undefined
              ? (data.result as Prisma.InputJsonValue)
              : undefined,
          confirmed: data.confirmed,
          error: data.error,
        },
      });
    } catch (err) {
      this.logger.error('Failed to write ToolCallAudit', err);
    }
  }
}
