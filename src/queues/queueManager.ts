import { Queue, type QueueOptions, type ConnectionOptions } from 'bullmq';
import { getRedisClient } from '../services/redisClient';
import { logger } from '../utils/logger';

const registry = new Map<string, Queue>();

/**
 * default job options applied to every queue unless overridden by the caller.
 */
const DEFAULT_JOB_OPTIONS: QueueOptions['defaultJobOptions'] = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

/**
 * returns the singleton Queue for the given name.
 * creates and registers it on first call.
 *
 * @param name  queue name
 * @param opts  optional overrides merged on top of defaults
 */
export function getQueue(name: string, opts?: Partial<QueueOptions>): Queue {
  const existing = registry.get(name);
  if (existing) {
    return existing;
  }

  const queueOpts: QueueOptions = {
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      ...(opts?.defaultJobOptions ?? {}),
    },
    ...opts,
    // cast required: bullmq bundles its own ioredis, causing structural type mismatch.
    // at runtime the instance is fully compatible.
    connection: getRedisClient() as unknown as ConnectionOptions,
  };

  const queue = new Queue(name, queueOpts);
  registry.set(name, queue);
  logger.info({ queue: name }, 'queue registered');
  return queue;
}

/**
 * gracefully closes all registered queues and clears the registry.
 * call during application shutdown.
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.all(
    Array.from(registry.values()).map(async (q) => {
      await q.close();
      logger.info({ queue: q.name }, 'queue closed');
    }),
  );
  registry.clear();
}
