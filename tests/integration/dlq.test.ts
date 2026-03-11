/**
 * integration tests for phase 5: dead letter queue routing and replay.
 *
 * requires a live redis instance on localhost:6379.
 * creates a temporary queue with a processor that always throws, verifies
 * that after all attempts are exhausted the job appears in the dlq, and
 * tests that replayDLQJob re-enqueues it to the original queue.
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import {
  watchForDeadLetters,
  replayDLQJob,
  dlqEmitter,
} from '../../src/services/deadLetterService';
import { getQueue } from '../../src/queues/queueManager';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const FAIL_QUEUE = 'integration-dlq-phase5';

describe('dlq integration: failure routing and replay', () => {
  let redis: IORedis;
  let failQueue: Queue;
  let dlqQueue: Queue;
  let failWorker: Worker;
  let failQueueEvents: QueueEvents;
  let watchQueueEvents: QueueEvents;

  beforeAll(() => {
    redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: false,
    });
  });

  beforeEach(() => {
    // source queue: 2 attempts, fast exponential backoff (50ms start)
    failQueue = new Queue(FAIL_QUEUE, {
      connection: redis as never,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 100 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });

    // dlqQueue is managed by queueManager (getQueue) since deadLetterService uses it
    dlqQueue = getQueue('dlq');

    failQueueEvents = new QueueEvents(FAIL_QUEUE, { connection: redis as never });

    // processor that always throws
    failWorker = new Worker<unknown, unknown>(
      FAIL_QUEUE,
      async () => {
        throw new Error('intentional failure for dlq integration test');
      },
      { connection: redis as never, concurrency: 1 },
    );

    // watchForDeadLetters uses its own QueueEvents internally
    watchQueueEvents = watchForDeadLetters(FAIL_QUEUE);
  });

  afterEach(async () => {
    await failWorker.close();
    await watchQueueEvents.close();
    await failQueueEvents.close();
    await failQueue.drain(true);
    await failQueue.obliterate({ force: true });
    await failQueue.close();
    // drain the dlq so it stays clean between tests
    await dlqQueue.drain(true);
    await dlqQueue.obliterate({ force: true });
    dlqEmitter.removeAllListeners();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('job that exhausts all attempts is routed to the dlq', async () => {
    const dlqJobPromise = new Promise<Record<string, unknown>>((resolve) => {
      dlqEmitter.once('dlq:routed', (dlqJobData: Record<string, unknown>) => {
        resolve(dlqJobData);
      });
    });

    await failQueue.add('always-fails', { payload: 'test-data' });

    const dlqJob = await dlqJobPromise;

    expect(dlqJob['originalQueue']).toBe(FAIL_QUEUE);
    expect(dlqJob['failedReason']).toMatch(/intentional failure/);
    expect(typeof dlqJob['failedAt']).toBe('number');
    expect(dlqJob['data']).toEqual({ payload: 'test-data' });
  }, 30_000);

  it('dlq contains the dead-letter job after routing', async () => {
    const dlqRoutedPromise = new Promise<void>((resolve) => {
      dlqEmitter.once('dlq:routed', () => resolve());
    });

    await failQueue.add('always-fails-2', { payload: 'dlq-check' });
    await dlqRoutedPromise;

    // small delay to let dlq.add() complete
    await new Promise((r) => setTimeout(r, 200));

    const waitingJobs = await dlqQueue.getWaiting(0, 99);
    const dlqJob = waitingJobs.find(
      (j) => (j.data as Record<string, unknown>)['originalQueue'] === FAIL_QUEUE,
    );
    expect(dlqJob).toBeDefined();
  }, 30_000);

  it('replayDLQJob re-adds the original job data to the source queue', async () => {
    const dlqRoutedPromise = new Promise<void>((resolve) => {
      dlqEmitter.once('dlq:routed', () => resolve());
    });

    const originalPayload = { payload: 'replay-test' };
    await failQueue.add('to-be-replayed', originalPayload);
    await dlqRoutedPromise;

    // wait for dlq job to be persisted
    await new Promise((r) => setTimeout(r, 300));

    const waitingJobs = await dlqQueue.getWaiting(0, 99);
    const dlqJob = waitingJobs.find(
      (j) => (j.data as Record<string, unknown>)['originalQueue'] === FAIL_QUEUE,
    );
    expect(dlqJob).toBeDefined();

    // stop the failing worker before replay so the replayed job isn't immediately failed again
    await failWorker.close();

    await replayDLQJob(dlqJob!.id!);

    // the replayed job should appear in the failQueue as waiting
    await new Promise((r) => setTimeout(r, 200));
    const replayedJobs = await failQueue.getWaiting(0, 99);
    const replayedJob = replayedJobs.find(
      (j) => (j.data as Record<string, unknown>)['payload'] === 'replay-test',
    );
    expect(replayedJob).toBeDefined();
  }, 30_000);
});
