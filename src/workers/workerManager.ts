import { Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { getRedisClient } from '../services/redisClient';
import { emailProcessor } from '../processors/emailProcessor';
import { reportProcessor } from '../processors/reportProcessor';
import { notifyProcessor } from '../processors/notifyProcessor';
import { logger } from '../utils/logger';
import { WORKER_CONCURRENCY, WORKER_LIMITER } from '../config/workers';

/**
 * registry of queue names to their processor functions.
 * processors are pure async functions - no bullmq coupling inside them.
 * `as never` cast is needed because each processor has a narrower Job<TData>
 * generic than what Worker's constructor expects.
 */
const QUEUE_PROCESSOR_MAP = {
  email: emailProcessor,
  report: reportProcessor,
  notify: notifyProcessor,
} as const;

export type KnownQueue = keyof typeof QUEUE_PROCESSOR_MAP;

export const KNOWN_QUEUES: KnownQueue[] = Object.keys(QUEUE_PROCESSOR_MAP) as KnownQueue[];

const workers = new Map<string, Worker>();

/**
 * creates (or returns existing) BullMQ Worker for `queueName`.
 *
 * @throws Error if `queueName` has no registered processor
 */
export function createWorker(queueName: string, concurrency?: number): Worker {
  if (!(queueName in QUEUE_PROCESSOR_MAP)) {
    throw new Error(`no processor registered for queue: ${queueName}`);
  }

  if (workers.has(queueName)) {
    return workers.get(queueName)!;
  }

  const processor = QUEUE_PROCESSOR_MAP[queueName as KnownQueue];
  const workerConcurrency = concurrency ?? WORKER_CONCURRENCY[queueName] ?? 5;

  const worker = new Worker(queueName, processor as never, {
    connection: getRedisClient() as unknown as ConnectionOptions,
    concurrency: workerConcurrency,
    limiter: WORKER_LIMITER,
  });

  worker.on('completed', (job) => {
    logger.info({ queue: queueName, jobId: job.id }, 'job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ queue: queueName, jobId: job?.id, err }, 'job failed');
  });

  worker.on('error', (err) => {
    logger.error({ queue: queueName, err }, 'worker error');
  });

  workers.set(queueName, worker);
  logger.info({ queue: queueName, concurrency: workerConcurrency }, 'worker created');

  return worker;
}

/**
 * gracefully closes every registered worker and clears the registry.
 * waits for all active jobs to finish before resolving.
 */
export async function closeAllWorkers(): Promise<void> {
  const closePromises = Array.from(workers.entries()).map(async ([name, worker]) => {
    await worker.close();
    logger.info({ queue: name }, 'worker closed');
  });

  await Promise.all(closePromises);
  workers.clear();
}

/**
 * test helper: clears the worker registry without closing connections.
 * use in unit tests where Worker.close() is mocked.
 */
export function _resetWorkers(): void {
  workers.clear();
}
