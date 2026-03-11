/**
 * Integration tests for Phase 7.3 — Priority Queue Validation.
 *
 * Verifies that BullMQ processes jobs in correct priority order.
 * In BullMQ, a LOWER priority number = HIGHER priority = processed first.
 * Jobs with no priority are treated as priority 0 (highest).
 *
 * Requires a live Redis instance on localhost:6379 (or REDIS_URL env var).
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const PRIO_QUEUE = 'integration-priority-phase7';

describe('priority integration: processing order', () => {
  let redis: IORedis;
  let queue: Queue;
  let worker: Worker;
  let queueEvents: QueueEvents;

  // Shared array filled by the worker processor — tracks the order in which
  // jobs complete. We use job.data.n (mirrors the priority value) so the array
  // directly shows processing order.
  const completionOrder: number[] = [];

  beforeAll(async () => {
    redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: false,
    });

    queue = new Queue(PRIO_QUEUE, {
      connection: redis as never,
      defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
    });

    // concurrency: 1 ensures jobs are processed one at a time in priority order.
    worker = new Worker<{ n: number }, { n: number }>(
      PRIO_QUEUE,
      async (job) => {
        completionOrder.push(job.data.n);
        return { n: job.data.n };
      },
      { connection: redis as never, concurrency: 1 },
    );

    queueEvents = new QueueEvents(PRIO_QUEUE, { connection: redis as never });

    // Wait for worker and QueueEvents to be ready before running tests.
    await worker.waitUntilReady();
    await queueEvents.waitUntilReady();
  });

  afterEach(async () => {
    queueEvents.removeAllListeners();
    await queue.drain(true);
    completionOrder.length = 0;
  });

  afterAll(async () => {
    await worker.close();
    await queueEvents.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await redis.quit();
  });

  it('processes lower priority number (higher urgency) jobs first', async () => {
    // Pause the worker so all three jobs are queued before any are processed.
    await worker.pause();

    // Add jobs in descending n order (10, 5, 1) to confirm priority, not
    // insertion order, drives processing sequence.
    await queue.add('task', { n: 10 }, { priority: 10 });
    await queue.add('task', { n: 5 }, { priority: 5 });
    await queue.add('task', { n: 1 }, { priority: 1 });

    // Register the completion listener BEFORE resuming to avoid races.
    const allCompleted = new Promise<void>((resolve) => {
      let count = 0;
      queueEvents.on('completed', () => {
        count++;
        if (count === 3) resolve();
      });
    });

    await worker.resume();
    await allCompleted;

    // BullMQ priority: lower number = higher urgency = processed first.
    // Expected order: 1 → 5 → 10
    expect(completionOrder).toEqual([1, 5, 10]);
  }, 30_000);

  it('two jobs with identical priority are processed in FIFO order', async () => {
    await worker.pause();

    await queue.add('task', { n: 100 }, { priority: 5 });
    await queue.add('task', { n: 200 }, { priority: 5 });

    const allCompleted = new Promise<void>((resolve) => {
      let count = 0;
      queueEvents.on('completed', () => {
        count++;
        if (count === 2) resolve();
      });
    });

    await worker.resume();
    await allCompleted;

    // Same priority → insertion order wins.
    expect(completionOrder).toEqual([100, 200]);
  }, 30_000);
});
