/**
 * Queue depth scraper — Phase 8.4 (Bonus).
 *
 * Periodically samples BullMQ queue depths (waiting, active, failed) and
 * updates Prometheus gauges so Prometheus can scrape them on its own schedule.
 */

import { Gauge } from 'prom-client';
import { register } from './metrics';
import { getQueue } from '../queues/queueManager';
import { KNOWN_QUEUES } from '../workers/workerManager';
import { logger } from '../utils/logger';

// ── gauges ─────────────────────────────────────────────────────────────────────

const queueWaitingJobs = new Gauge({
  name: 'queue_waiting_jobs',
  help: 'Number of jobs currently waiting in the queue.',
  labelNames: ['queue'] as const,
  registers: [register],
});

const queueActiveJobs = new Gauge({
  name: 'queue_active_jobs',
  help: 'Number of jobs currently active (being processed) in the queue.',
  labelNames: ['queue'] as const,
  registers: [register],
});

const queueFailedJobs = new Gauge({
  name: 'queue_failed_jobs',
  help: 'Number of jobs in the failed state in the queue.',
  labelNames: ['queue'] as const,
  registers: [register],
});

// ── scraper ────────────────────────────────────────────────────────────────────

let scraperTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts a periodic scrape of all known queue depths into Prometheus gauges.
 *
 * Safe to call multiple times — only one interval is ever running.
 *
 * @param intervalMs Scrape interval in milliseconds (default 15 000).
 * @returns A stop function that clears the interval.
 */
export function startQueueScraper(intervalMs = 15_000): () => void {
  if (scraperTimer !== null) {
    return () => stopQueueScraper();
  }

  async function scrape(): Promise<void> {
    await Promise.all(
      KNOWN_QUEUES.map(async (queueName) => {
        try {
          const q = getQueue(queueName);
          const counts = await q.getJobCounts('waiting', 'active', 'failed');
          queueWaitingJobs.labels({ queue: queueName }).set(counts['waiting'] ?? 0);
          queueActiveJobs.labels({ queue: queueName }).set(counts['active'] ?? 0);
          queueFailedJobs.labels({ queue: queueName }).set(counts['failed'] ?? 0);
        } catch (err) {
          logger.warn({ queue: queueName, err }, 'queue scraper error');
        }
      }),
    );
  }

  // Run immediately on start, then on interval.
  scrape().catch((err) => logger.error({ err }, 'queue scraper initial run failed'));
  scraperTimer = setInterval(() => {
    scrape().catch((err) => logger.error({ err }, 'queue scraper interval error'));
  }, intervalMs);
  // unref() prevents the timer from blocking process exit (e.g. in tests).
  scraperTimer.unref();

  return () => stopQueueScraper();
}

/** Stops the queue scraper interval. */
export function stopQueueScraper(): void {
  if (scraperTimer !== null) {
    clearInterval(scraperTimer);
    scraperTimer = null;
  }
}
