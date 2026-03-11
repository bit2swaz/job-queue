import { EventEmitter } from 'events';
import { QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { getRedisClient } from './redisClient';
import { getQueue } from '../queues/queueManager';
import { notifyAlerts } from './alertService';
import type { DLQJobData } from './alertService';
import { logger } from '../utils/logger';

export type { DLQJobData };

/**
 * module-level event emitter for dlq routing events.
 * consumers can listen to the 'dlq:routed' event to react to dead letters
 * without polling the queue.
 *
 * @example
 * dlqEmitter.on('dlq:routed', (dlqJob: DLQJobData) => { ... });
 */
export const dlqEmitter = new EventEmitter();

/**
 * subscribes to QueueEvents for the given queue name.
 * when a job exhausts all retry attempts it is forwarded to the dlq queue
 * and the 'dlq:routed' event is emitted on {@link dlqEmitter}.
 *
 * uses a dedicated redis connection for QueueEvents as recommended by bullmq.
 *
 * @param queueName - name of the queue to watch
 * @returns the QueueEvents instance (close it during graceful shutdown)
 */
export function watchForDeadLetters(queueName: string): QueueEvents {
  const queueEvents = new QueueEvents(queueName, {
    connection: getRedisClient() as unknown as ConnectionOptions,
  });

  queueEvents.on(
    'failed',
    async ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      const sourceQueue = getQueue(queueName);
      const job = await sourceQueue.getJob(jobId);

      if (!job) {
        return;
      }

      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < maxAttempts) {
        return;
      }

      const dlqJobData: DLQJobData = {
        originalQueue: queueName,
        jobId,
        data: job.data,
        failedReason,
        failedAt: Date.now(),
      };

      const dlqQueue = getQueue('dlq');
      await dlqQueue.add('dead-letter', dlqJobData);

      dlqEmitter.emit('dlq:routed', dlqJobData);
      await notifyAlerts(dlqJobData);

      logger.error(
        { originalQueue: queueName, jobId, failedReason },
        'job exhausted all retries - moved to dead-letter queue',
      );
    },
  );

  return queueEvents;
}

/**
 * returns basic statistics about the dead-letter queue.
 *
 * @returns count of all jobs in the dlq (all states), the oldest waiting job,
 *          and the failedReason from the most recently failed dlq job.
 */
export async function getDLQStats(): Promise<{
  count: number;
  oldestJob: unknown;
  recentFailureReason: string | null;
}> {
  const dlqQueue = getQueue('dlq');

  const jobCounts = await dlqQueue.getJobCounts('waiting', 'active', 'failed', 'completed');
  const count = Object.values(jobCounts).reduce((a, b) => a + b, 0);

  const waitingJobs = await dlqQueue.getWaiting(0, 0);
  const oldestJob = waitingJobs[0] ?? null;

  const failedJobs = await dlqQueue.getFailed(0, 0);
  const recentDlqJob = failedJobs[0];
  const recentFailureReason = recentDlqJob
    ? ((recentDlqJob.data as DLQJobData).failedReason ?? null)
    : null;

  return { count, oldestJob, recentFailureReason };
}

/**
 * re-adds a job from the dead-letter queue back to its original queue
 * so it can be processed again (manual recovery / replay).
 *
 * @param jobId - id of the job in the dlq
 * @throws Error if no job with the given id exists in the dlq
 */
export async function replayDLQJob(jobId: string): Promise<void> {
  const dlqQueue = getQueue('dlq');
  const job = await dlqQueue.getJob(jobId);

  if (!job) {
    throw new Error(`dlq job not found: ${jobId}`);
  }

  const dlqData = job.data as DLQJobData;
  const originalQueue = getQueue(dlqData.originalQueue);
  await originalQueue.add('replayed-job', dlqData.data);

  logger.info(
    { jobId, originalQueue: dlqData.originalQueue },
    'dlq job replayed to original queue',
  );
}
