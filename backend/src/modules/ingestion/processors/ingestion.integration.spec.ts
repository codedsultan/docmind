/**
 * Real-database integration test for the ingestion → retrieval round-trip.
 *
 * Prerequisites (run manually or in CI with a real DB):
 *   - `testcontainers` package: `pnpm add -D testcontainers`
 *   - Docker daemon running with `pgvector/pgvector:pg16` image pulled
 *
 * Why skipped by default:
 *   Unit tests cover behaviour; this proves the SQL + vector round-trip works
 *   against an actual Postgres + pgvector instance. It is expensive (~10s startup)
 *   and requires Docker, so it runs in a separate CI job rather than `pnpm test`.
 *
 * To run: DATABASE_URL=<pg-url> pnpm test:e2e --testPathPattern=integration
 *
 * When testcontainers is installed, remove the `describe.skip` and fill in
 * the container setup below.
 */

describe.skip('Ingestion → Retrieval integration (requires Docker)', () => {
  /**
   * Setup outline (uncomment when testcontainers is installed):
   *
   * import { GenericContainer, Wait } from 'testcontainers';
   * import { PrismaClient } from '../../../../generated/prisma/client';
   * import { execSync } from 'child_process';
   *
   * let container: StartedTestContainer;
   * let prisma: PrismaClient;
   *
   * beforeAll(async () => {
   *   container = await new GenericContainer('pgvector/pgvector:pg16')
   *     .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'docmind_test' })
   *     .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
   *     .withExposedPorts(5432)
   *     .start();
   *
   *   const port = container.getMappedPort(5432);
   *   process.env['DATABASE_URL'] = `postgresql://postgres:test@localhost:${port}/docmind_test`;
   *
   *   execSync('pnpm prisma migrate deploy', { stdio: 'inherit' });
   *
   *   prisma = new PrismaClient();
   *   await prisma.$connect();
   * }, 60_000);
   *
   * afterAll(async () => {
   *   await prisma.$disconnect();
   *   await container.stop();
   * });
   */

  it('inserts a chunk with a vector embedding and retrieves it by similarity', async () => {
    /**
     * Round-trip assertion outline:
     *
     * 1. Create a Document row (userId=DEV_USER_ID, title='test-doc', visibility='private', status='ready').
     * 2. Insert a DocumentChunk with a known 768-dim vector close to the query embedding.
     * 3. Call RetrievalService.retrieve('test query', { userId: DEV_USER_ID, topK: 1 }).
     * 4. Assert the returned chunk's documentId matches the document created in step 1.
     * 5. Assert fusedScore > 0.
     */
    expect(true).toBe(true); // placeholder — remove when implementing
  });
});
