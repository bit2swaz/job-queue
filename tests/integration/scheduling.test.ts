/**
 * Integration tests for Phase 7.1 — Cron / Scheduled Jobs.
 *
 * Verifies that scheduleRecurringJob and removeScheduledJob correctly
 * register and deregister BullMQ job schedulers backed by a live Redis.
 *
 * Requires a live Redis instance on localhost:6379 (or REDIS_URL env var).
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { scheduleRecurringJob, removeScheduledJob } from '../../src/queues/scheduledJobs';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const SCHED_QUEUE = 'integration-scheduling-phase7';

describe('scheduling integration: cron job schedulers', () => {
  let redis: IORedis;
  let queue: Queue;

  beforeAll(() => {
    redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: false,
    });

    // Separate Queue instance for inspection — shares the same Redis namespace
    // as the internal Queue created by getQueue() inside scheduledJobs.ts.
    queue = new Queue(SCHED_QUEUE, {
      connection: redis as never,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    });
  });

  afterEach(async () => {
    // Remove every registered scheduler so tests start from a clean state.
    const schedulers = await queue.getJobSchedulers();
    await Promise.all(schedulers.map((s) => queue.removeJobScheduler(s.key as string)));
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await redis.quit();
  });

  it('scheduleRecurringJob registers a job scheduler in BullMQ', async () => {
    await scheduleRecurringJob(
      SCHED_QUEUE,
      'test-cron',
      { source: 'integration-test' },
      '*/5 * * * *',
    );

    const schedulers = await queue.getJobSchedulers();
    expect(schedulers.length).toBeGreaterThan(0);

    const found = schedulers.find((s) => s.key === 'test-cron');
    expect(found).toBeDefined();
  });

  it('removeScheduledJob removes the scheduler from BullMQ', async () => {
    await scheduleRecurringJob(
      SCHED_QUEUE,
      'to-remove',
      { source: 'integration-test' },
      '*/10 * * * *',
    );

    // Confirm it was registered.
    const before = await queue.getJobSchedulers();
    expect(before.some((s) => s.key === 'to-remove')).toBe(true);

    await removeScheduledJob(SCHED_QUEUE, 'to-remove');

    const after = await queue.getJobSchedulers();
    expect(after.every((s) => s.key !== 'to-remove')).toBe(true);
  });

  it('scheduleRecurringJob is idempotent (upsert — no duplicate schedulers)', async () => {
    const pattern = '*/1 * * * *';
    await scheduleRecurringJob(SCHED_QUEUE, 'idempotent-job', { v: 1 }, pattern);
    // Calling again with the same key must not create a second scheduler.
    await scheduleRecurringJob(SCHED_QUEUE, 'idempotent-job', { v: 2 }, pattern);

    const schedulers = await queue.getJobSchedulers();
    const matching = schedulers.filter((s) => s.key === 'idempotent-job');
    expect(matching.length).toBe(1);
  });

  it('scheduleRecurringJob accepts an optional tz override', async () => {
    await scheduleRecurringJob(SCHED_QUEUE, 'tz-aware-cron', { zone: 'utc' }, '0 9 * * 1-5', 'UTC');

    const schedulers = await queue.getJobSchedulers();
    const found = schedulers.find((s) => s.key === 'tz-aware-cron');
    expect(found).toBeDefined();
    // BullMQ stores the tz in the scheduler record.
    expect((found as unknown as Record<string, unknown>)['tz']).toBe('UTC');
  });
});
