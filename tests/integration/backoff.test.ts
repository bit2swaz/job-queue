/**
 * Integration tests for Phase 7.4 — Exponential Backoff Verification.
 *
 * 1. Processor fails on the first two attempts, succeeds on the third.
 *    Verifies that the worker retried and the final state is "completed".
 *
 * 2. Processor always fails — job exhausts all attempts and is routed to
 *    the dead-letter queue via watchForDeadLetters().
 *
 * Requires a live Redis instance on localhost:6379 (or REDIS_URL env var).
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { watchForDeadLetters, dlqEmitter } from '../../src/services/deadLetterService';
import { getQueue } from '../../src/queues/queueManager';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const BACKOFF_QUEUE = 'integration-backoff-phase7';

describe('backoff integration: retry and DLQ routing', () => {
  let redis: IORedis;

  beforeAll(() => {
    redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: false,
    });
  });

  afterAll(async () => {
    await redis.quit();
  });

  // ── scenario 1: fail → fail → succeed ─────────────────────────────────────

  describe('retry until success', () => {
    let queue: Queue;
    let worker: Worker;
    let queueEvents: QueueEvents;
    let processorCallCount: number;

    beforeEach(async () => {
      processorCallCount = 0;

      queue = new Queue(BACKOFF_QUEUE, {
        connection: redis as never,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'fixed', delay: 150 }, // fast for tests
          removeOnComplete: false,
          removeOnFail: false,
        },
      });

      worker = new Worker<unknown, { ok: boolean }>(
        BACKOFF_QUEUE,
        async () => {
          processorCallCount++;
          if (processorCallCount < 3) {
            throw new Error('intentional transient failure');
          }
          return { ok: true };
        },
        { connection: redis as never, concurrency: 1 },
      );

      queueEvents = new QueueEvents(BACKOFF_QUEUE, {
        connection: redis as never,
      });

      await worker.waitUntilReady();
      await queueEvents.waitUntilReady();
    });

    afterEach(async () => {
      queueEvents.removeAllListeners();
      await worker.close();
      await queueEvents.close();
      await queue.drain(true);
      await queue.obliterate({ force: true });
      await queue.close();
    });

    it('job that fails twice then succeeds ends in completed state', async () => {
      const addedJob = await queue.add('retry-test', { x: 42 });

      const completedPromise = new Promise<string>((resolve) => {
        queueEvents.on('completed', ({ jobId }) => resolve(jobId));
      });

      const finishedJobId = await completedPromise;
      expect(finishedJobId).toBe(addedJob.id);

      // Processor should have been called exactly 3 times.
      expect(processorCallCount).toBe(3);

      // Final state on the job record must be 'completed'.
      const job = await queue.getJob(finishedJobId);
      expect(job).toBeDefined();
      const state = await job!.getState();
      expect(state).toBe('completed');

      // Return value from the third (successful) attempt should be present.
      expect(job!.returnvalue).toEqual({ ok: true });
    }, 30_000);
  });

  // ── scenario 2: all attempts exhausted → routes to DLQ ───────────────────

  describe('exhausted retries → DLQ routing', () => {
    let failQueue: Queue;
    let failWorker: Worker;
    let failQueueEvents: QueueEvents;
    let watchQueueEvents: QueueEvents;

    beforeEach(() => {
      failQueue = new Queue(BACKOFF_QUEUE, {
        connection: redis as never,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'fixed', delay: 100 },
          removeOnComplete: false,
          removeOnFail: false,
        },
      });

      // dlqQueue is owned by queueManager; do NOT obliterate it — other
      // integration tests (dlq.test.ts) share the same queue and clean it up.
      // We just need to import getQueue so the DLQ is pre-registered before
      // watchForDeadLetters routes jobs to it.
      getQueue('dlq');

      failQueueEvents = new QueueEvents(BACKOFF_QUEUE, {
        connection: redis as never,
      });

      failWorker = new Worker<unknown, unknown>(
        BACKOFF_QUEUE,
        async () => {
          throw new Error('always fails for backoff-dlq test');
        },
        { connection: redis as never, concurrency: 1 },
      );

      watchQueueEvents = watchForDeadLetters(BACKOFF_QUEUE);
    });

    afterEach(async () => {
      await failWorker.close();
      await watchQueueEvents.close();
      await failQueueEvents.close();
      await failQueue.drain(true);
      await failQueue.obliterate({ force: true });
      await failQueue.close();
      // DLQ is shared with other integration tests; do not drain/obliterate it.
      // dlq.test.ts filters by originalQueue so our orphaned entries are harmless.
      dlqEmitter.removeAllListeners();
    });

    it('job that exhausts all attempts is routed to the DLQ', async () => {
      const dlqRoutedPromise = new Promise<Record<string, unknown>>((resolve) => {
        dlqEmitter.once('dlq:routed', (dlqJobData: Record<string, unknown>) => {
          resolve(dlqJobData);
        });
      });

      await failQueue.add('always-fails', { payload: 'backoff-dlq-test' });

      const dlqData = await dlqRoutedPromise;

      expect(dlqData['originalQueue']).toBe(BACKOFF_QUEUE);
      expect(dlqData['failedReason']).toMatch(/always fails/);
      expect(dlqData['data']).toEqual({ payload: 'backoff-dlq-test' });
    }, 30_000);
  });
});
