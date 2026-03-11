/**
 * Container smoke tests — Phase 10.
 *
 * These tests assume that `docker compose -f docker/docker-compose.test.yml up -d`
 * has already been called by the CI pipeline before this suite runs.
 *
 * In the local dev environment, skip this suite if the
 * `RUN_CONTAINER_SMOKE` environment variable is not set.
 *
 * CI pipeline usage:
 *   docker compose -f docker/docker-compose.test.yml up -d
 *   RUN_CONTAINER_SMOKE=1 npm run test -- --testPathPattern=docker
 */

const runSuite = process.env['RUN_CONTAINER_SMOKE'] === '1';
const describeOrSkip = runSuite ? describe : describe.skip;

describeOrSkip('container smoke tests: Redis via docker-compose.test.yml', () => {
  it('Redis on localhost:6379 responds to PING', async () => {
    const IORedis = (await import('ioredis')).default;
    const client = new IORedis('redis://localhost:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    try {
      await client.connect();
      const pong = await client.ping();
      expect(pong).toBe('PONG');
    } finally {
      await client.quit();
    }
  }, 10_000);
});
