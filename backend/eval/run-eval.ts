/**
 * Retrieval eval runner (NestJS bootstrap).
 *
 * Usage:   pnpm eval           (via root package.json)
 *          pnpm --filter docmind-api eval
 *
 * Prereqs: DATABASE_URL and GEMINI_API_KEY set; Postgres with pgvector running.
 *          Fixture chunks are pre-computed and seeded automatically before cases run.
 *
 * Exit codes:
 *   0 — aggregate thresholds met (or DB unreachable — soft failure so CI does not
 *       block on infrastructure outages; the seed step also fails visibly if DB is down)
 *   1 — hit@K or MRR below threshold, or fatal error
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { RetrievalService } from '../src/modules/retrieval/retrieval.service';
import { DEV_USER_ID } from '../src/common/constants';
import { seedEvalFixtures } from './seed';
import spec from './retrieval.json';

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

function isHit(content: string, snippets: string[]): boolean {
  return snippets.some((s) => content.toLowerCase().includes(s.toLowerCase()));
}

function reciprocalRank(
  chunks: { content: string }[],
  snippets: string[],
): number {
  for (let i = 0; i < chunks.length; i++) {
    if (isHit(chunks[i].content, snippets)) return 1 / (i + 1);
  }
  return 0;
}

async function runEval(): Promise<void> {
  const { thresholds, cases } = spec as EvalSpec;
  const TOP_K = 5;

  let app: INestApplicationContext | undefined;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
  } catch (err) {
    console.warn(
      '\n[eval] SKIP — cannot start application context.\n' +
        '       Check DATABASE_URL and GEMINI_API_KEY are set, and that Postgres is reachable.\n' +
        '       Error: ' +
        (err instanceof Error ? err.message : String(err)) +
        '\n',
    );
    process.exit(0);
  }

  // Seed the eval fixture (no-op if already present; does not call embedding API)
  try {
    await seedEvalFixtures(app);
  } catch (err) {
    console.warn(
      '[eval] WARNING — seed step failed (DB may be empty or unreachable).\n' +
        '       If the DB is not running, this is expected in local dev without Docker.\n' +
        '       Error: ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  const retrieval = app.get(RetrievalService);

  let hits = 0;
  let rrSum = 0;

  console.log(
    `\n📊  Retrieval Eval — ${cases.length} cases, top-${TOP_K}` +
      `\n    Thresholds: hit@${TOP_K} ≥ ${thresholds.hitAtK}  MRR ≥ ${thresholds.mrr}\n`,
  );

  for (const [i, c] of cases.entries()) {
    let chunks: { content: string }[] = [];
    try {
      chunks = await retrieval.retrieve(c.question, {
        userId: DEV_USER_ID,
        topK: TOP_K,
      });
    } catch (err) {
      console.log(
        `  ⚠️  [${i + 1}/${cases.length}] ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const hit = chunks.some((ch) => isHit(ch.content, c.expectedSnippets))
      ? 1
      : 0;
    const rr = reciprocalRank(chunks, c.expectedSnippets);

    hits += hit;
    rrSum += rr;

    const icon = hit ? '✅' : '❌';
    console.log(
      `  ${icon} [${i + 1}/${cases.length}] ${c.question.slice(0, 60)}…  RR=${rr.toFixed(2)}`,
    );
  }

  await app.close();

  const hitAtK = hits / cases.length;
  const mrr = rrSum / cases.length;

  console.log('\n─────────────────────────────────────────');
  console.log(
    `  hit@${TOP_K}: ${hitAtK.toFixed(3)}  (threshold ≥ ${thresholds.hitAtK})`,
  );
  console.log(`  MRR:    ${mrr.toFixed(3)}  (threshold ≥ ${thresholds.mrr})`);
  console.log('─────────────────────────────────────────\n');

  const pass = hitAtK >= thresholds.hitAtK && mrr >= thresholds.mrr;

  if (pass) {
    console.log('✅  PASS — all thresholds met\n');
    process.exit(0);
  } else {
    console.log('❌  FAIL');
    if (hitAtK < thresholds.hitAtK)
      console.log(
        `    hit@${TOP_K} ${hitAtK.toFixed(3)} < ${thresholds.hitAtK}`,
      );
    if (mrr < thresholds.mrr)
      console.log(`    MRR    ${mrr.toFixed(3)} < ${thresholds.mrr}`);
    console.log(
      '\n    Tip: if the DB is empty, the fixture seed may have failed — check above.\n' +
        '         In CI, ensure the pgvector service container is healthy before this job runs.\n',
    );
    process.exit(1);
  }
}

runEval().catch((err) => {
  console.error('[eval] Fatal error:', err);
  process.exit(1);
});
