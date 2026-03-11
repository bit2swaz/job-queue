import { getQueue, closeAllQueues } from './queueManager';
import { logger } from '../utils/logger';

export type QueueDepth = {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
};

/**
 * drains all waiting and delayed jobs from the named queue.
 *
 * @param name  queue name as registered in queueManager
 */
export async function drainQueue(name: string): Promise<void> {
  const queue = getQueue(name);
  await queue.drain();
  logger.info({ queue: name }, 'queue drained');
}

/**
 * returns job counts per state for the named queue.
 *
 * @param name  queue name as registered in queueManager
 */
export async function getQueueDepth(name: string): Promise<QueueDepth> {
  const queue = getQueue(name);
  const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
  return {
    waiting: counts['waiting'] ?? 0,
    active: counts['active'] ?? 0,
    delayed: counts['delayed'] ?? 0,
    completed: counts['completed'] ?? 0,
    failed: counts['failed'] ?? 0,
  };
}

export { closeAllQueues };
