import { ChunkerService } from './chunker.service';

describe('ChunkerService', () => {
  let service: ChunkerService;

  beforeEach(() => {
    service = new ChunkerService();
  });

  it('returns [] for empty string', () => {
    expect(service.chunk('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(service.chunk('   \n  ')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const text = 'Hello world.';
    const chunks = service.chunk(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('splits long text into multiple chunks', () => {
    // Create text ~2400 chars (≈3 chunks at 800 chars target)
    const paragraph = 'A'.repeat(850);
    const text = [paragraph, paragraph, paragraph].join('\n\n');
    const chunks = service.chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('respects paragraph boundaries (splits at \\n\\n)', () => {
    const para1 = 'First paragraph. '.repeat(20).trim(); // ~340 chars
    const para2 = 'Second paragraph. '.repeat(20).trim(); // ~360 chars
    const para3 = 'Third paragraph. '.repeat(20).trim(); // ~360 chars
    const text = [para1, para2, para3].join('\n\n');

    const chunks = service.chunk(text);
    // At 800 char target, first two paragraphs (~700 chars total) fit together
    // Third paragraph pushes into a new chunk
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Each chunk should contain whole paragraphs (no mid-paragraph splits when not needed)
    expect(chunks[0].content).toContain('First paragraph');
  });

  it('produces sequential chunkIndex starting at 0', () => {
    const paragraph = 'Word sentence here. '.repeat(50); // ~1000 chars
    const text = [paragraph, paragraph].join('\n\n');
    const chunks = service.chunk(text);
    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });

  it('is idempotent — same text produces same contentHash values', () => {
    const text = 'Hello world. '.repeat(100);
    const chunks1 = service.chunk(text);
    const chunks2 = service.chunk(text);
    expect(chunks1.map((c) => c.contentHash)).toEqual(
      chunks2.map((c) => c.contentHash),
    );
  });

  it('chunks with overlap keep trailing content from previous chunk', () => {
    // Build text long enough to require two chunks
    const firstParagraph = 'First section text. '.repeat(45); // ~900 chars
    const secondParagraph = 'Second section text. '.repeat(45);
    const text = [firstParagraph, secondParagraph].join('\n\n');

    const chunks = service.chunk(text, { targetSize: 800, overlap: 150 });
    expect(chunks.length).toBeGreaterThan(1);
    // Overlap means the second chunk starts with content from the end of first
    const firstEnd = chunks[0].content.slice(-100);
    const secondStart = chunks[1].content.slice(0, 200);
    // They should share some characters (overlap)
    const hasOverlap = secondStart.includes(firstEnd.slice(-30));
    expect(hasOverlap).toBe(true);
  });

  it('handles single very long paragraph by splitting at sentence boundaries', () => {
    // 10 sentences each ~90 chars — total ~900 chars, exceeds 800 target
    const text = 'This is a sentence that is quite long indeed. '.repeat(20);
    const chunks = service.chunk(text, { targetSize: 400, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => {
      expect(c.content.length).toBeLessThanOrEqual(500); // some tolerance for overlap
    });
  });
});
