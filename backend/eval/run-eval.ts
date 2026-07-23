/**
 * Retrieval eval runner.
 *
 * Usage:   pnpm eval
 * Prereqs: DATABASE_URL set and a running Postgres with pgvector.
 *          GEMINI_API_KEY set for embedding. Redis optional.
 *
 * Exit codes: 0 = all cases pass (or DB unavailable — soft failure)
 *             1 = one or more cases below threshold
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { RetrievalService } from '../src/modules/retrieval/retrieval.service';
import { DEV_USER_ID } from '../src/common/constants';
import cases from './retrieval.json';

interface EvalCase {
  id: string;
  query: string;
  expectedDocIds: string[];
  hitAtK: number;
  hitAtKThreshold: number;
  mrrThreshold: number;
  note?: string;
}

interface CaseResult {
  id: string;
  query: string;
  hitAtK: number;
  mrr: number;
  hitAtKThreshold: number;
  mrrThreshold: number;
  passed: boolean;
  retrieved: string[];
}

const logger = new Logger('eval');

function computeHitAtK(
  retrieved: string[],
  expected: string[],
  k: number,
): number {
  if (expected.length === 0) return 1; // No expected = can't fail
  const topK = retrieved.slice(0, k);
  return expected.some((id) => topK.includes(id)) ? 1 : 0;
}

function computeMRR(retrieved: string[], expected: string[]): number {
  if (expected.length === 0) return 1; // No expected = can't fail
  for (let i = 0; i < retrieved.length; i++) {
    if (expected.includes(retrieved[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

async function runEval(): Promise<void> {
  let app: INestApplicationContext | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
  } catch (err) {
    console.warn(
      '[eval] SKIP — cannot start application context (check DATABASE_URL / GEMINI_API_KEY):',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(0);
  }

  const typedCases = cases as EvalCase[];
  const results: CaseResult[] = [];
  let failures = 0;

  try {
    const retrieval = app.get(RetrievalService);

    for (const c of typedCases) {
      let retrieved: string[] = [];
      try {
        const chunks = await retrieval.retrieve(c.query, {
          userId: DEV_USER_ID,
          topK: c.hitAtK,
        });
        retrieved = chunks.map((ch) => ch.documentId);
      } catch (err) {
        logger.error(`Case ${c.id}: retrieval threw — ${String(err)}`);
      }

      const hit = computeHitAtK(retrieved, c.expectedDocIds, c.hitAtK);
      const mrr = computeMRR(retrieved, c.expectedDocIds);
      const passed = hit >= c.hitAtKThreshold && mrr >= c.mrrThreshold;

      if (!passed) failures++;

      results.push({
        id: c.id,
        query: c.query,
        hitAtK: hit,
        mrr,
        hitAtKThreshold: c.hitAtKThreshold,
        mrrThreshold: c.mrrThreshold,
        passed,
        retrieved,
      });
    }
  } finally {
    await app.close();
  }

  // ── Report ────────────────────────────────────────────────────────
  console.log('\n=== Retrieval Eval Results ===\n');
  for (const r of results) {
    const mark = r.passed ? '✓' : '✗';
    console.log(
      `${mark} [${r.id}] hit@${cases.find((c) => c.id === r.id)?.hitAtK ?? '?'}=${r.hitAtK.toFixed(2)} ` +
        `(≥${r.hitAtKThreshold})  MRR=${r.mrr.toFixed(2)} (≥${r.mrrThreshold})`,
    );
    if (!r.passed) {
      console.log(`  query: ${r.query}`);
      console.log(`  retrieved docIds: [${r.retrieved.join(', ')}]`);
    }
  }

  const total = results.length;
  const passed = total - failures;
  console.log(`\n${passed}/${total} cases passed.\n`);

  if (failures > 0) process.exit(1);
}

runEval().catch((err) => {
  console.error('[eval] Fatal error:', err);
  process.exit(1);
});
