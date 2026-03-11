import { createWorker } from './workerManager';
import type { Worker } from 'bullmq';

/**
 * starts the notify/webhook worker with the configured concurrency (10).
 * higher concurrency because webhook POSTs are fast and i/o-bound.
 */
export function startNotifyWorker(): Worker {
  return createWorker('notify');
}
