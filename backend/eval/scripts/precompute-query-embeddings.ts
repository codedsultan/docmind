/**
 * One-off script to pre-compute query embeddings for the eval set.
 *
 * Run once (requires GEMINI_API_KEY):
 *   cd backend
 *   GEMINI_API_KEY=<key> ts-node -r tsconfig-paths/register eval/scripts/precompute-query-embeddings.ts
 *
 * Output: eval/fixtures/query-embeddings.json
 *   { [normalizedQuery: string]: number[] }
 *   Keys are the trimmed/lowercased query text; values are 768-dim embeddings.
 *
 * Commit the output file. CI seeds it into Redis so the eval never calls the embedding API.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;

const EVAL_PATH = path.join(__dirname, '../retrieval.json');
const OUTPUT_PATH = path.join(__dirname, '../fixtures/query-embeddings.json');

interface EvalCase {
  question: string;
  expectedSnippets: string[];
  tags?: string[];
}

interface EvalSpec {
  description: string;
  thresholds: { hitAtK: number; mrr: number };
  cases: EvalCase[];
}

async function embedQuery(query: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`;
  const body = JSON.stringify({
    model: `models/${GEMINI_EMBEDDING_MODEL}`,
    content: { parts: [{ text: query }] },
    outputDimensionality: EMBEDDING_DIMENSIONS,
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
    embedding?: { values?: number[] };
  };

  if (!data.embedding?.values)
    throw new Error('Gemini API returned embedding without values');

  return data.embedding.values;
}

async function main(): Promise<void> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable not set.');
    process.exit(1);
  }

  if (!fs.existsSync(EVAL_PATH)) {
    console.error(`Eval spec not found: ${EVAL_PATH}`);
    process.exit(1);
  }

  const spec = JSON.parse(fs.readFileSync(EVAL_PATH, 'utf-8')) as EvalSpec;
  const queries = spec.cases.map((c) => c.question.trim().toLowerCase());

  console.log(`Embedding ${queries.length} eval queries with Gemini…`);

  const result: Record<string, number[]> = {};

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    process.stdout.write(
      `  [${i + 1}/${queries.length}] "${q.slice(0, 50)}…" `,
    );
    try {
      const embedding = await embedQuery(spec.cases[i].question, apiKey);
      result[q] = embedding;
      console.log(`✓ (${embedding.length} dims)`);
    } catch (err) {
      console.error(
        `✗ FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.log(
    `\nWrote ${Object.keys(result).length} query embeddings to ${OUTPUT_PATH}`,
  );

  // Verify all dimensions
  const dims = new Set(Object.values(result).map((e) => e.length));
  if (dims.size !== 1 || [...dims][0] !== EMBEDDING_DIMENSIONS) {
    console.error(
      `ERROR: expected all ${EMBEDDING_DIMENSIONS} dims, got dimensions: ${[...dims]}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
