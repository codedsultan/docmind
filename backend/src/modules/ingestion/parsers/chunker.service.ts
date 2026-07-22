import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface Chunk {
  content: string;
  contentHash: string;
  chunkIndex: number;
}

export interface ChunkerOptions {
  /** Target chunk size in characters. Default 800. */
  targetSize?: number;
  /** Overlap between consecutive chunks in characters. Default 150. */
  overlap?: number;
}

@Injectable()
export class ChunkerService {
  /**
   * Split text into overlapping chunks, respecting paragraph and sentence boundaries.
   * Chunks are deterministic — same input always produces same chunks.
   */
  chunk(text: string, options?: ChunkerOptions): Chunk[] {
    const targetSize = options?.targetSize ?? 800;
    const overlap = options?.overlap ?? 150;
    const normalized = text.trim();

    if (!normalized) return [];

    const paragraphs = this.splitParagraphs(normalized);
    const chunks: Chunk[] = [];
    let current = '';
    let index = 0;

    for (const paragraph of paragraphs) {
      // If adding this paragraph would exceed target, finalize current chunk
      if (
        current.length + paragraph.length > targetSize &&
        current.length > 0
      ) {
        chunks.push(this.makeChunk(current, index++));
        // Overlap: keep the last ~overlap chars from the current chunk
        current = current.slice(-overlap);
      }

      // If a single paragraph exceeds target, split it at sentence boundaries
      if (paragraph.length > targetSize) {
        if (current.length > 0) {
          chunks.push(this.makeChunk(current, index++));
          current = current.slice(-overlap);
        }
        const sentenceChunks = this.splitLongParagraph(
          paragraph,
          targetSize,
          overlap,
        );
        for (const sc of sentenceChunks) {
          chunks.push(this.makeChunk(sc, index++));
        }
        current = sentenceChunks[sentenceChunks.length - 1].slice(-overlap);
        continue;
      }

      current += (current ? '\n\n' : '') + paragraph;
    }

    // Final chunk
    if (current.trim()) {
      chunks.push(this.makeChunk(current, index));
    }

    return chunks;
  }

  private makeChunk(content: string, chunkIndex: number): Chunk {
    const normalized = content.trim();
    return {
      content: normalized,
      contentHash: createHash('sha256').update(normalized).digest('hex'),
      chunkIndex,
    };
  }

  private splitParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  private splitLongParagraph(
    paragraph: string,
    targetSize: number,
    overlap: number,
  ): string[] {
    const sentences = paragraph.match(/[^.!?\n]+[.!?]*\s*/g) ?? [paragraph];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (current.length + sentence.length > targetSize && current.length > 0) {
        chunks.push(current.trim());
        current = current.slice(-overlap);
      }
      current += sentence;
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks.length > 0 ? chunks : [paragraph.trim()];
  }
}
