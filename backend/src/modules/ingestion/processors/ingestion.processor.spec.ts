import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { IngestionJob } from '../ingestion.service';
import { IngestionProcessor } from './ingestion.processor';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChunkerService } from '../parsers/chunker.service';
import { EMBEDDING_PROVIDER } from '../../providers/embedding.provider';
import {
  DOCUMENT_INGESTED_EVENT,
  DocumentIngestedEvent,
} from '../events/document-ingested.event';

const makeJob = (data: IngestionJob) =>
  ({ id: 'test-job', data }) as unknown as Job<IngestionJob>;

describe('IngestionProcessor', () => {
  let processor: IngestionProcessor;
  let prisma: {
    document: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $executeRaw: jest.Mock;
  };
  let chunker: { chunk: jest.Mock };
  let embedProvider: { embed: jest.Mock };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      document: { findUnique: jest.fn(), update: jest.fn() },
      $executeRaw: jest.fn(),
    };
    chunker = { chunk: jest.fn() };
    embedProvider = { embed: jest.fn() };
    emitter = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        IngestionProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: ChunkerService, useValue: chunker },
        { provide: EMBEDDING_PROVIDER, useValue: embedProvider },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    processor = module.get(IngestionProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  describe('status transitions', () => {
    it('transitions document to processing then ready on success', async () => {
      const doc = {
        id: 'doc-1',
        rawText: 'Hello world chunk content here',
        userId: 'user-1',
      };
      const chunk = {
        content: 'Hello world',
        contentHash: 'abc',
        chunkIndex: 0,
      };

      prisma.document.findUnique.mockResolvedValue(doc);
      prisma.document.update.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      chunker.chunk.mockReturnValue([chunk]);
      embedProvider.embed.mockResolvedValue({
        embeddings: [Array(768).fill(0.1)],
      });

      await processor.process(makeJob({ documentId: 'doc-1' }));

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'processing' } }),
      );
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ready' } }),
      );
    });

    it('marks document failed and re-throws on embedding error', async () => {
      const doc = { id: 'doc-1', rawText: 'some text', userId: 'user-1' };

      prisma.document.findUnique.mockResolvedValue(doc);
      prisma.document.update.mockResolvedValue({});
      chunker.chunk.mockReturnValue([
        { content: 'some text', contentHash: 'h1', chunkIndex: 0 },
      ]);
      embedProvider.embed.mockRejectedValue(new Error('Embedding failed'));

      await expect(
        processor.process(makeJob({ documentId: 'doc-1' })),
      ).rejects.toThrow('Embedding failed');

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'failed' } }),
      );
    });

    it('skips to ready without inserting chunks when document produces zero chunks', async () => {
      const doc = { id: 'doc-1', rawText: 'text', userId: 'user-1' };

      prisma.document.findUnique.mockResolvedValue(doc);
      prisma.document.update.mockResolvedValue({});
      chunker.chunk.mockReturnValue([]);

      await processor.process(makeJob({ documentId: 'doc-1' }));

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ready' } }),
      );
    });

    it('marks document failed without processing when rawText is missing', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        rawText: null,
        userId: 'user-1',
      });
      prisma.document.update.mockResolvedValue({});

      await processor.process(makeJob({ documentId: 'doc-1' }));

      expect(chunker.chunk).not.toHaveBeenCalled();
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'failed' } }),
      );
    });
  });

  describe('error handling', () => {
    it('throws when document is not found', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(
        processor.process(makeJob({ documentId: 'missing' })),
      ).rejects.toThrow('Document missing not found');
    });

    it('marks failed when chunk count does not match embedding count', async () => {
      const doc = { id: 'doc-1', rawText: 'text', userId: 'user-1' };

      prisma.document.findUnique.mockResolvedValue(doc);
      prisma.document.update.mockResolvedValue({});
      chunker.chunk.mockReturnValue([
        { content: 'a', contentHash: 'h1', chunkIndex: 0 },
        { content: 'b', contentHash: 'h2', chunkIndex: 1 },
      ]);
      // Only one embedding returned for two chunks
      embedProvider.embed.mockResolvedValue({
        embeddings: [Array(768).fill(0)],
      });

      await expect(
        processor.process(makeJob({ documentId: 'doc-1' })),
      ).rejects.toThrow('Embedding count mismatch');

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'failed' } }),
      );
    });
  });

  describe('event emission', () => {
    it('emits DocumentIngested with correct payload after successful ingestion', async () => {
      const doc = {
        id: 'doc-1',
        rawText: 'chunk text here',
        userId: 'user-42',
      };
      const chunk = {
        content: 'chunk text here',
        contentHash: 'abc',
        chunkIndex: 0,
      };

      prisma.document.findUnique.mockResolvedValue(doc);
      prisma.document.update.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      chunker.chunk.mockReturnValue([chunk]);
      embedProvider.embed.mockResolvedValue({
        embeddings: [Array(768).fill(0.5)],
      });

      await processor.process(makeJob({ documentId: 'doc-1' }));

      expect(emitter.emit).toHaveBeenCalledWith(
        DOCUMENT_INGESTED_EVENT,
        expect.any(DocumentIngestedEvent),
      );

      const event = (
        emitter.emit.mock.calls[0] as unknown[]
      )?.[1] as DocumentIngestedEvent;
      expect(event.documentId).toBe('doc-1');
      expect(event.chunkCount).toBe(1);
      expect(event.userId).toBe('user-42');
    });

    it('does not emit event when ingestion fails', async () => {
      const doc = { id: 'doc-1', rawText: 'text', userId: 'user-1' };

      prisma.document.findUnique.mockResolvedValue(doc);
      prisma.document.update.mockResolvedValue({});
      chunker.chunk.mockReturnValue([
        { content: 'text', contentHash: 'h1', chunkIndex: 0 },
      ]);
      embedProvider.embed.mockRejectedValue(new Error('fail'));

      await expect(
        processor.process(makeJob({ documentId: 'doc-1' })),
      ).rejects.toThrow();

      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('vector format', () => {
    it('stores the embedding as a bracketed comma-separated string (not raw array)', async () => {
      const doc = { id: 'doc-1', rawText: 'hello', userId: 'user-1' };

      prisma.document.findUnique.mockResolvedValue(doc);
      prisma.document.update.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      chunker.chunk.mockReturnValue([
        { content: 'hello', contentHash: 'h1', chunkIndex: 0 },
      ]);
      const embedding = [0.1, 0.2, 0.3];
      embedProvider.embed.mockResolvedValue({ embeddings: [embedding] });

      await processor.process(makeJob({ documentId: 'doc-1' }));

      // The tagged template receives interpolated values.
      // The vectorStr value must be `[0.1,0.2,0.3]` — NOT a raw JS array.
      const rawCall = prisma.$executeRaw.mock.calls[0] as unknown[];
      const flatArgs = rawCall?.flat(Infinity);
      expect(flatArgs).toContain('[0.1,0.2,0.3]');
      // Confirm the raw array is NOT passed directly (would be `0.1,0.2,0.3` without brackets)
      expect(flatArgs).not.toContain(embedding);
    });
  });
});
