import type { RetrievedChunk } from '../retrieval/retrieval.service';

export interface Citation {
  marker: string;
  chunkId: string;
  documentTitle: string;
  snippet: string;
}

/**
 * Build sequential [N] citations covering all provided chunks.
 * Used when every retrieved chunk is surfaced regardless of answer content.
 */
export function buildAllCitations(
  chunks: RetrievedChunk[],
  snippetLength = 150,
): Citation[] {
  return chunks.map((c, i) => ({
    marker: `[${i + 1}]`,
    chunkId: c.chunkId,
    documentTitle: c.documentTitle,
    snippet: c.content.slice(0, snippetLength),
  }));
}

/**
 * Parse [N] markers from a generated answer and return only the cited chunks.
 * N is 1-indexed and must refer to a valid position in the chunks array.
 */
export function parseCitations(
  answer: string,
  chunks: RetrievedChunk[],
  snippetLength = 150,
): Citation[] {
  const found = new Set<number>();
  const markerRe = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(answer)) !== null) {
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= chunks.length) found.add(n);
  }

  return [...found]
    .sort((a, b) => a - b)
    .map((n) => {
      const chunk = chunks[n - 1];
      return {
        marker: `[${n}]`,
        chunkId: chunk.chunkId,
        documentTitle: chunk.documentTitle,
        snippet: chunk.content.slice(0, snippetLength),
      };
    });
}
