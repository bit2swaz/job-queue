import { createWorker } from './workerManager';
import type { Worker } from 'bullmq';

/**
 * starts the email worker with the configured concurrency (5).
 * call once at process startup; returns the Worker instance.
 */
export function startEmailWorker(): Worker {
  return createWorker('email');
}
