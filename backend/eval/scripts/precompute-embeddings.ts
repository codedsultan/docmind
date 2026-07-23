/**
 * One-off script to pre-compute chunk embeddings for the eval fixture.
 *
 * Run once (requires GEMINI_API_KEY):
 *   cd backend
 *   GEMINI_API_KEY=<key> ts-node -r tsconfig-paths/register eval/scripts/precompute-embeddings.ts
 *
 * Output: eval/fixtures/postgres-overview-embedded.json
 *   { chunks: [{ content: string; embedding: number[] }] }
 *
 * Commit the output file. CI uses it to seed the eval DB without live API calls.
 */

import * as fs from 'fs';
import * as path from 'path';

const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
const BATCH_SIZE = 100;

const FIXTURE_TXT = path.join(__dirname, '../fixtures/postgres-overview.txt');
const OUTPUT_PATH = path.join(
  __dirname,
  '../fixtures/postgres-overview-embedded.json',
);

// ── Inline chunker (mirrors ChunkerService defaults: 800 chars, 150 overlap) ──

function chunk(text: string, targetSize = 800, overlap = 150): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length > targetSize && current.length > 0) {
      chunks.push(current.trim());
      current = current.slice(-overlap);
    }

    if (para.length > targetSize) {
      if (current.length > 0) {
        chunks.push(current.trim());
        current = current.slice(-overlap);
      }
      const sentences = para.match(/[^.!?\n]+[.!?]*\s*/g) ?? [para];
      let sub = '';
      for (const sent of sentences) {
        if (sub.length + sent.length > targetSize && sub.length > 0) {
          chunks.push(sub.trim());
          sub = sub.slice(-overlap);
        }
        sub += sent;
      }
      if (sub.trim()) chunks.push(sub.trim());
      current = (chunks[chunks.length - 1] ?? '').slice(-overlap);
      continue;
    }

    current += (current ? '\n\n' : '') + para;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── Gemini batch embed ─────────────────────────────────────────────────────

async function embedBatch(
  texts: string[],
  apiKey: string,
): Promise<number[][]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`;
  const body = JSON.stringify({
    requests: texts.map((text) => ({
      model: `models/${GEMINI_EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    embeddings?: { values?: number[] }[];
  };

  return (data.embeddings ?? []).map((e) => {
    if (!e.values)
      throw new Error('Gemini API returned embedding without values');
    return e.values;
  });
}

async function main(): Promise<void> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable not set.');
    process.exit(1);
  }

  if (!fs.existsSync(FIXTURE_TXT)) {
    console.error(`Fixture not found: ${FIXTURE_TXT}`);
    process.exit(1);
  }

  const text = fs.readFileSync(FIXTURE_TXT, 'utf-8');
  const chunks = chunk(text);

  console.log(`Chunked into ${chunks.length} chunks. Embedding with Gemini…`);

  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await embedBatch(batch, apiKey);
    embeddings.push(...batchEmbeddings);
    console.log(
      `  embedded ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}`,
    );
  }

  const result = {
    chunks: chunks.map((content, idx) => ({
      content,
      embedding: embeddings[idx],
    })),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.log(`\nWrote ${chunks.length} chunks to ${OUTPUT_PATH}`);

  const dims = result.chunks[0]?.embedding?.length ?? 0;
  console.log(
    `Embedding dimensions: ${dims} (expected ${EMBEDDING_DIMENSIONS})`,
  );

  if (dims !== EMBEDDING_DIMENSIONS) {
    console.error(`ERROR: expected ${EMBEDDING_DIMENSIONS} dims, got ${dims}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
