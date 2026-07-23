import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ToolRegistryService } from './tool-registry.service';
import { RiskTier } from '../../common/constants';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import type { Tool, ToolContext } from './tool.interface';
import { isToolProposal } from './tool-proposal.type';

const ctx: ToolContext = { userId: 'user-1', queryId: 'q-1' };

function makeTool(overrides: Partial<Tool>): Tool {
  return {
    name: 'test_tool',
    description: 'Test tool',
    riskTier: RiskTier.read,
    schema: z.object({ value: z.string() }),
    execute: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function makePrisma() {
  return { toolCallAudit: { create: jest.fn().mockResolvedValue({}) } };
}

function makeRedis() {
  const store = new Map<string, string>();
  return {
    set: jest.fn((key: string, val: string): Promise<void> => {
      store.set(key, val);
      return Promise.resolve();
    }),
    get: jest.fn((key: string): Promise<string | null> =>
      Promise.resolve(store.get(key) ?? null),
    ),
    del: jest.fn((key: string): Promise<void> => {
      store.delete(key);
      return Promise.resolve();
    }),
    _store: store,
  };
}

async function buildService(prisma: unknown, redis: unknown) {
  const mod = await Test.createTestingModule({
    providers: [
      ToolRegistryService,
      { provide: PrismaService, useValue: prisma },
      { provide: REDIS_CLIENT, useValue: redis },
    ],
  }).compile();
  return mod.get(ToolRegistryService);
}

describe('ToolRegistryService', () => {
  describe('read tier', () => {
    it('executes immediately and writes NO audit row', async () => {
      const prisma = makePrisma();
      const service = await buildService(prisma, null);
      const tool = makeTool({ riskTier: RiskTier.read });
      service.register(tool);

      const result = await service.dispatch('test_tool', { value: 'x' }, ctx);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tool.execute).toHaveBeenCalledWith({ value: 'x' }, ctx);
      expect(result).toEqual({ ok: true });
      expect(prisma.toolCallAudit.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown tool', async () => {
      const service = await buildService(makePrisma(), null);
      await expect(service.dispatch('no_such_tool', {}, ctx)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('internal_write tier', () => {
    it('executes and writes an audit row', async () => {
      const prisma = makePrisma();
      const service = await buildService(prisma, null);
      const tool = makeTool({ riskTier: RiskTier.internalWrite });
      service.register(tool);

      await service.dispatch('test_tool', { value: 'x' }, ctx);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tool.execute).toHaveBeenCalled();
      expect(prisma.toolCallAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toolName: 'test_tool',
            confirmed: false,
          }) as unknown,
        }),
      );
    });

    it('writes an audit row even when execute throws', async () => {
      const prisma = makePrisma();
      const service = await buildService(prisma, null);
      const tool = makeTool({
        riskTier: RiskTier.internalWrite,
        execute: jest.fn().mockRejectedValue(new Error('boom')),
      });
      service.register(tool);

      await expect(
        service.dispatch('test_tool', { value: 'x' }, ctx),
      ).rejects.toThrow('boom');
      expect(prisma.toolCallAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ error: 'boom' }) as unknown,
        }),
      );
    });
  });

  describe('external_write tier', () => {
    it('never calls execute and returns a ToolProposal', async () => {
      const redis = makeRedis();
      const service = await buildService(makePrisma(), redis);
      const tool = makeTool({ riskTier: RiskTier.externalWrite });
      service.register(tool);

      const result = await service.dispatch('test_tool', { value: 'x' }, ctx);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tool.execute).not.toHaveBeenCalled();
      expect(isToolProposal(result)).toBe(true);
    });

    it('stores confirmationToken in Redis', async () => {
      const redis = makeRedis();
      const service = await buildService(makePrisma(), redis);
      const tool = makeTool({ riskTier: RiskTier.externalWrite });
      service.register(tool);

      const proposal = await service.dispatch('test_tool', { value: 'y' }, ctx);
      expect(isToolProposal(proposal)).toBe(true);
      if (!isToolProposal(proposal)) return;

      expect(redis.set).toHaveBeenCalledWith(
        `confirm:${proposal.confirmationToken}`,
        expect.stringContaining('test_tool'),
        'EX',
        300,
      );
    });
  });

  describe('executeConfirmed', () => {
    it('executes tool and writes confirmed audit row', async () => {
      const prisma = makePrisma();
      const redis = makeRedis();
      const service = await buildService(prisma, redis);
      const tool = makeTool({ riskTier: RiskTier.externalWrite });
      service.register(tool);

      const proposal = await service.dispatch('test_tool', { value: 'z' }, ctx);
      if (!isToolProposal(proposal)) throw new Error('expected proposal');

      const result = await service.executeConfirmed(
        proposal.confirmationToken,
        ctx,
      );
      expect(result).toEqual({ ok: true });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tool.execute).toHaveBeenCalled();
      expect(prisma.toolCallAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ confirmed: true }) as unknown,
        }),
      );
    });

    it('rejects expired / already-used tokens', async () => {
      const prisma = makePrisma();
      const redis = makeRedis();
      const service = await buildService(prisma, redis);

      await expect(
        service.executeConfirmed('bad-token', ctx),
      ).rejects.toThrow();
    });

    it('is single-use: second call rejects', async () => {
      const prisma = makePrisma();
      const redis = makeRedis();
      const service = await buildService(prisma, redis);
      const tool = makeTool({ riskTier: RiskTier.externalWrite });
      service.register(tool);

      const proposal = await service.dispatch('test_tool', { value: 'z' }, ctx);
      if (!isToolProposal(proposal)) throw new Error();

      await service.executeConfirmed(proposal.confirmationToken, ctx);
      await expect(
        service.executeConfirmed(proposal.confirmationToken, ctx),
      ).rejects.toThrow();
    });
  });
});
