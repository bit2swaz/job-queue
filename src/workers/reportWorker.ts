import { createWorker } from './workerManager';
import type { Worker } from 'bullmq';

/**
 * starts the report worker with the configured concurrency (3).
 * lower concurrency than email/notify because report generation is heavier.
 */
export function startReportWorker(): Worker {
  return createWorker('report');
}
