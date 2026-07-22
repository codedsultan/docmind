import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { IngestionService } from './ingestion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ParserService } from './parsers/parser.service';

const QUEUE_NAME = process.env.QUEUE_INGESTION ?? 'ingestion';

const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => ({
  buffer: Buffer.from('test document content'),
  originalname: 'test.txt',
  mimetype: 'text/plain',
  fieldname: 'file',
  encoding: '7bit',
  size: 20,
  stream: undefined as any,
  destination: '',
  filename: '',
  path: '',
  ...overrides,
});

describe('IngestionService', () => {
  let service: IngestionService;
  let prisma: {
    document: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let parser: { parse: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      document: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    parser = { parse: jest.fn().mockResolvedValue({ text: 'parsed text' }) };
    queue = { add: jest.fn().mockResolvedValue({}) };

    const module = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ParserService, useValue: parser },
        { provide: getQueueToken(QUEUE_NAME), useValue: queue },
      ],
    }).compile();

    service = module.get(IngestionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('uploadDocument', () => {
    it('creates a new document and enqueues an ingestion job', async () => {
      const file = makeFile();
      const created = { id: 'doc-new', title: 'test', status: 'pending' };

      prisma.document.findUnique.mockResolvedValue(null);
      prisma.document.create.mockResolvedValue(created);

      const result = await service.uploadDocument(file, {});

      expect(prisma.document.create).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'ingest-document',
        { documentId: created.id },
        expect.objectContaining({ attempts: 3 }),
      );
      expect(result.document).toBe(created);
      expect(result.message).toMatch(/uploaded/i);
    });

    it('returns existing active document without re-enqueueing when content hash matches', async () => {
      const file = makeFile();
      const existing = { id: 'doc-old', isActive: true, status: 'ready' };

      prisma.document.findUnique.mockResolvedValue(existing);

      const result = await service.uploadDocument(file, {});

      expect(prisma.document.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      expect(result.document).toBe(existing);
      expect(result.message).toMatch(/duplicate/i);
    });

    it('reactivates a soft-deleted document and enqueues re-ingestion', async () => {
      const file = makeFile();
      const softDeleted = {
        id: 'doc-old',
        isActive: false,
        version: 2,
        status: 'ready',
      };
      const reactivated = {
        ...softDeleted,
        isActive: true,
        status: 'pending',
        version: 3,
      };

      prisma.document.findUnique.mockResolvedValue(softDeleted);
      prisma.document.update.mockResolvedValue(reactivated);

      const result = await service.uploadDocument(file, {});

      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      const expectedUpdate = expect.objectContaining({
        data: expect.objectContaining({
          isActive: true,
          status: 'pending',
          version: softDeleted.version + 1,
        }),
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
      expect(prisma.document.update).toHaveBeenCalledWith(expectedUpdate);
      expect(queue.add).toHaveBeenCalledWith(
        'ingest-document',
        { documentId: softDeleted.id },
        expect.anything(),
      );
      expect(result.message).toMatch(/reactivated/i);
    });

    it('uses userId scoped dedup lookup (userId + contentHash)', async () => {
      const file = makeFile();

      prisma.document.findUnique.mockResolvedValue(null);
      prisma.document.create.mockResolvedValue({ id: 'doc-1' });

      await service.uploadDocument(file, {}, 'custom-user-id');

      // findUnique must use the composite key, not just contentHash
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      const expectedFindUnique = expect.objectContaining({
        where: expect.objectContaining({
          userId_contentHash: expect.objectContaining({
            userId: 'custom-user-id',
          }),
        }),
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
      expect(prisma.document.findUnique).toHaveBeenCalledWith(
        expectedFindUnique,
      );
    });
  });

  describe('listDocuments', () => {
    it('returns active documents for the user ordered by createdAt desc', async () => {
      const docs = [{ id: 'a' }, { id: 'b' }];
      prisma.document.findMany.mockResolvedValue(docs);

      const result = await service.listDocuments('user-1');

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', isActive: true },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toBe(docs);
    });
  });

  describe('getDocument', () => {
    it('returns the document when found', async () => {
      const doc = { id: 'doc-1', userId: 'user-1' };
      prisma.document.findFirst.mockResolvedValue(doc);

      const result = await service.getDocument('doc-1', 'user-1');
      expect(result).toBe(doc);
    });

    it('throws NotFoundException when document does not exist', async () => {
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(service.getDocument('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteDocument', () => {
    it('soft-deletes the document by setting isActive = false', async () => {
      const doc = { id: 'doc-1', userId: 'user-1' };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.document.update.mockResolvedValue({});

      await service.deleteDocument('doc-1', 'user-1');

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });

    it('throws NotFoundException when document not found', async () => {
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(service.deleteDocument('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
