import { Test } from '@nestjs/testing';
import { TraceService, CreateTraceDto } from './trace.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrisma() {
  return {
    queryTrace: {
      create: jest.fn().mockResolvedValue({ id: 'trace-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

async function buildService(prisma: unknown) {
  const mod = await Test.createTestingModule({
    providers: [TraceService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return mod.get(TraceService);
}

const baseDto: CreateTraceDto = {
  userId: 'user-1',
  query: 'What is Postgres?',
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  latencyBreakdown: { total: 1234 },
  cacheFlags: { embeddingHit: false, answerHit: false },
};

describe('TraceService', () => {
  it('createTrace writes a query_traces row', async () => {
    const prisma = makePrisma();
    const service = await buildService(prisma);

    const result = await service.createTrace(baseDto);

    expect(result).toEqual({ id: 'trace-1' });
    expect(prisma.queryTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          query: 'What is Postgres?',
        }) as unknown,
      }),
    );
  });

  it('onTurnCompleted creates a trace via event listener', async () => {
    const prisma = makePrisma();
    const service = await buildService(prisma);

    await service.onTurnCompleted({
      userId: 'user-2',
      query: 'Summarize document X',
      provider: 'groq',
      model: 'llama3-8b',
      latencyBreakdown: { total: 500 },
    });

    expect(prisma.queryTrace.create).toHaveBeenCalledTimes(1);
  });

  it('onTurnCompleted does not throw on DB error', async () => {
    const prisma = makePrisma();
    prisma.queryTrace.create.mockRejectedValue(new Error('DB down'));
    const service = await buildService(prisma);

    await expect(
      service.onTurnCompleted({
        userId: 'user-1',
        query: 'test',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        latencyBreakdown: {},
      }),
    ).resolves.not.toThrow();
  });
});
