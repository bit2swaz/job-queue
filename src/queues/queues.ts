/**
 * named queue singletons.
 *
 * import a queue by name rather than calling getQueue() directly in application code.
 * each queue is registered in the central queueManager registry on first import.
 */

import { getQueue } from './queueManager';

/** transactional emails (welcome, password reset, etc.) */
export const emailQueue = getQueue('email');

/**
 * long-running report generation jobs.
 * priority: 10 ensures these yield to lower-priority tasks.
 * attempts: 5 with exponential backoff for flaky external dependencies.
 */
export const reportQueue = getQueue('report', {
  defaultJobOptions: {
    priority: 10,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

/** push / in-app notification delivery */
export const notifyQueue = getQueue('notify');

/**
 * dead-letter queue.
 * jobs are moved here after exhausting all retry attempts
 * so they can be inspected and manually re-queued.
 */
export const dlq = getQueue('dlq', {
  defaultJobOptions: {
    attempts: 1,
    removeOnFail: false,
  },
});
