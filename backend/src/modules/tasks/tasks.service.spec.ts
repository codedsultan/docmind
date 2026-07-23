import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrisma() {
  return {
    task: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 't-1', title: 'Test task', done: false }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 't-1', done: true }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
}

async function buildService(prisma: unknown) {
  const mod = await Test.createTestingModule({
    providers: [TasksService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return {
    service: mod.get(TasksService),
    prisma: prisma as ReturnType<typeof makePrisma>,
  };
}

describe('TasksService', () => {
  describe('parseDueAt', () => {
    let service: TasksService;

    beforeEach(async () => {
      const { service: s } = await buildService(makePrisma());
      service = s;
    });

    it('returns null for undefined input', () => {
      expect(service.parseDueAt(undefined)).toBeNull();
    });

    it('returns null for unparseable string', () => {
      expect(service.parseDueAt('not-a-date-at-all-xyz')).toBeNull();
    });

    it('parses a natural-language date', () => {
      const result = service.parseDueAt('next Monday');
      expect(result).toBeInstanceOf(Date);
    });

    it('parses an explicit date string', () => {
      const result = service.parseDueAt('January 1, 2030');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2030);
    });
  });

  it('create stores a task', async () => {
    const { service, prisma } = await buildService(makePrisma());
    await service.create('u-1', 'My task');
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'My task' }) as unknown,
      }),
    );
  });

  it('findOne throws NotFoundException for missing task', async () => {
    const { service } = await buildService(makePrisma());
    await expect(service.findOne('u-1', 'missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('toggleDone flips the done flag', async () => {
    const prisma = makePrisma();
    prisma.task.findFirst.mockResolvedValue({
      id: 't-1',
      userId: 'u-1',
      done: false,
    });
    const { service } = await buildService(prisma);
    await service.toggleDone('u-1', 't-1');
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { done: true } }),
    );
  });
});
