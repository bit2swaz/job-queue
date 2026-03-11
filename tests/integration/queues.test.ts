/**
 * integration tests for the queue layer.
 *
 * requires a live redis instance on localhost:6379.
 * creates real bullmq Queue instances and exercises add/count/drain.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const TEST_QUEUE = 'integration-test-queue';

describe('queue integration', () => {
  let redis: IORedis;
  let queue: Queue;

  beforeAll(() => {
    redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    queue = new Queue(TEST_QUEUE, {
      connection: redis as never,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    });
  });

  afterAll(async () => {
    // drain before closing to avoid leaving test data in redis
    await queue.drain();
    await queue.obliterate({ force: true });
    await queue.close();
    await redis.quit();
  });

  it('creates a bullmq Queue instance connected to real redis', async () => {
    // getJobCounts succeeds only if the queue can reach redis
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
    expect(typeof counts['waiting']).toBe('number');
    expect(typeof counts['active']).toBe('number');
  });

  it('adds a job and the waiting count increments', async () => {
    const before = await queue.getJobCounts('waiting');
    await queue.add('test-job', { hello: 'world' });
    const after = await queue.getJobCounts('waiting');
    expect(after['waiting'] ?? 0).toBeGreaterThan(before['waiting'] ?? 0);
  });

  it('drains the queue and waiting count returns to zero', async () => {
    await queue.add('drain-test', { x: 1 });
    await queue.add('drain-test', { x: 2 });
    await queue.drain();
    const counts = await queue.getJobCounts('waiting');
    expect(counts['waiting']).toBe(0);
  });

  it('getJobCounts returns structured counts for all states', async () => {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
    const keys = Object.keys(counts);
    expect(keys).toContain('waiting');
    expect(keys).toContain('active');
    expect(keys).toContain('delayed');
    expect(keys).toContain('completed');
    expect(keys).toContain('failed');
  });
});
