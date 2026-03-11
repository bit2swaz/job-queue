/**
 * integration tests for worker job processing.
 *
 * requires a live redis instance on localhost:6379.
 * creates a real bullmq Worker with the emailProcessor and exercises the full
 * add() → Worker picks up → COMPLETED job lifecycle.
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { emailProcessor, type EmailJobData } from '../../../src/processors/emailProcessor';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const TEST_QUEUE = 'integration-worker-phase4';

describe('worker integration: full job lifecycle', () => {
  let redis: IORedis;
  let emailQueue: Queue<EmailJobData>;
  let queueEvents: QueueEvents;
  let worker: Worker<EmailJobData>;

  beforeAll(() => {
    redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: false,
    });
  });

  beforeEach(() => {
    emailQueue = new Queue<EmailJobData>(TEST_QUEUE, {
      connection: redis as never,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    });
    queueEvents = new QueueEvents(TEST_QUEUE, { connection: redis as never });
    worker = new Worker<EmailJobData>(TEST_QUEUE, emailProcessor as never, {
      connection: redis as never,
      concurrency: 1,
    });
  });

  afterEach(async () => {
    await worker.close();
    await emailQueue.drain(true);
    await emailQueue.obliterate({ force: true });
    await emailQueue.close();
    await queueEvents.close();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('job flows from add() to COMPLETED and returnvalue contains messageId and sentAt', async () => {
    const job = await emailQueue.add('test-email', {
      to: 'integration@example.com',
      subject: 'worker phase 4 integration test',
      body: 'this is the email body for the integration test',
    });

    const returnvalue = await job.waitUntilFinished(queueEvents, 15_000);

    expect(returnvalue).toHaveProperty('messageId');
    expect(typeof (returnvalue as { messageId: string }).messageId).toBe('string');
    expect((returnvalue as { messageId: string }).messageId.length).toBeGreaterThan(0);
    expect(typeof (returnvalue as { sentAt: number }).sentAt).toBe('number');
  }, 20_000);

  it('job with invalid data (empty to/subject/body) moves to FAILED state', async () => {
    const job = await emailQueue.add(
      'test-invalid-email',
      { to: '', subject: '', body: '' },
      { attempts: 1, removeOnFail: false },
    );

    await expect(job.waitUntilFinished(queueEvents, 15_000)).rejects.toThrow();

    const failedJob = await emailQueue.getJob(job.id!);
    expect(await failedJob?.getState()).toBe('failed');
    expect(failedJob?.failedReason).toMatch(/to/i);
  }, 20_000);

  it('worker processes multiple jobs sequentially with correct results', async () => {
    const jobs = await Promise.all([
      emailQueue.add('email-1', {
        to: 'a@example.com',
        subject: 'first',
        body: 'body 1',
      }),
      emailQueue.add('email-2', {
        to: 'b@example.com',
        subject: 'second',
        body: 'body 2',
      }),
    ]);

    const results = await Promise.all(
      jobs.map((job) => job.waitUntilFinished(queueEvents, 15_000)),
    );

    for (const result of results) {
      expect((result as { messageId: string }).messageId).toBeTruthy();
    }
  }, 20_000);
});
