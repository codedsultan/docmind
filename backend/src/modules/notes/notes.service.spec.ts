import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotesService } from './notes.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrisma() {
  return {
    note: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'n-1', content: 'test', userId: 'u-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'n-1', content: 'updated' }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
}

async function buildService(prisma: unknown) {
  const mod = await Test.createTestingModule({
    providers: [NotesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return {
    service: mod.get(NotesService),
    prisma: prisma as ReturnType<typeof makePrisma>,
  };
}

describe('NotesService', () => {
  it('create stores a note', async () => {
    const { service, prisma } = await buildService(makePrisma());
    await service.create('u-1', 'My note');
    expect(prisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'My note' }) as unknown,
      }),
    );
  });

  it('findOne throws NotFoundException for missing note', async () => {
    const { service } = await buildService(makePrisma());
    await expect(service.findOne('u-1', 'missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update calls prisma.note.update', async () => {
    const prisma = makePrisma();
    prisma.note.findFirst.mockResolvedValue({ id: 'n-1', userId: 'u-1' });
    const { service } = await buildService(prisma);
    await service.update('u-1', 'n-1', 'updated content');
    expect(prisma.note.update).toHaveBeenCalled();
  });

  it('remove calls prisma.note.delete', async () => {
    const prisma = makePrisma();
    prisma.note.findFirst.mockResolvedValue({ id: 'n-1', userId: 'u-1' });
    const { service } = await buildService(prisma);
    await service.remove('u-1', 'n-1');
    expect(prisma.note.delete).toHaveBeenCalled();
  });
});
