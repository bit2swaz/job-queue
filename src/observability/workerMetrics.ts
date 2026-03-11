/**
 * Worker metrics hooks.
 *
 * Call `attachMetrics(worker)` after creating a Worker to wire BullMQ lifecycle
 * events into the Prometheus counters/gauges/histograms defined in metrics.ts.
 */

import type { Worker, Job } from 'bullmq';
import {
  jobsCompletedTotal,
  jobsActiveCurrent,
  jobsFailedTotal,
  jobDurationSeconds,
  jobAttemptsTotal,
} from './metrics';

/**
 * Attaches Prometheus metric hooks to a BullMQ Worker.
 *
 * Events wired:
 *  - `completed` → inc `jobs_completed_total`, observe `job_duration_seconds`
 *                  and `job_attempts_total`
 *  - `failed`    → inc `jobs_failed_total`
 *  - `active`    → inc `jobs_active_current`
 *  - `drained`   → reset `jobs_active_current` for the worker's queue to 0
 *
 * @param worker A BullMQ Worker instance (may already be started).
 */
export function attachMetrics(worker: Worker): void {
  const queue = worker.name;

  worker.on('completed', (job: Job) => {
    jobsCompletedTotal.labels({ queue }).inc();

    if (job.processedOn !== undefined && job.timestamp !== undefined) {
      const durationSeconds = (job.processedOn - job.timestamp) / 1000;
      jobDurationSeconds.labels({ queue }).observe(durationSeconds);
    }

    jobAttemptsTotal.labels({ queue }).observe(job.attemptsMade);
  });

  worker.on('failed', (job: Job | undefined) => {
    void job; // unused but typed for BullMQ event signature
    jobsFailedTotal.labels({ queue }).inc();
  });

  worker.on('active', (job: Job) => {
    void job;
    jobsActiveCurrent.labels({ queue }).inc();
  });

  worker.on('drained', () => {
    jobsActiveCurrent.labels({ queue }).set(0);
  });
}
