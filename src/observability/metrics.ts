/**
 * Prometheus metrics registry.
 *
 * Initialises the five custom metrics required by Phase 8 plus the default
 * Node.js process metrics (CPU, memory, event-loop lag …).
 *
 * Import `register` anywhere you need to expose or reset metrics.
 */

import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

/** Shared Prometheus registry — exported so routes and tests can access it. */
export const register = new Registry();

// ── custom metrics ─────────────────────────────────────────────────────────────

/** Total number of jobs that completed successfully, per queue. */
export const jobsCompletedTotal = new Counter({
  name: 'jobs_completed_total',
  help: 'Total number of jobs completed successfully.',
  labelNames: ['queue'] as const,
  registers: [register],
});

/** Total number of jobs that failed (after all retries), per queue. */
export const jobsFailedTotal = new Counter({
  name: 'jobs_failed_total',
  help: 'Total number of jobs that failed.',
  labelNames: ['queue'] as const,
  registers: [register],
});

/** Number of jobs currently being processed, per queue. */
export const jobsActiveCurrent = new Gauge({
  name: 'jobs_active_current',
  help: 'Number of jobs currently active (being processed).',
  labelNames: ['queue'] as const,
  registers: [register],
});

/** Job processing duration in seconds, per queue. */
export const jobDurationSeconds = new Histogram({
  name: 'job_duration_seconds',
  help: 'Job processing duration from timestamp to processedOn (seconds).',
  labelNames: ['queue'] as const,
  buckets: [0.1, 0.5, 1, 5, 30, 60],
  registers: [register],
});

/** Number of attempts made per job (retry distribution), per queue. */
export const jobAttemptsTotal = new Histogram({
  name: 'job_attempts_total',
  help: 'Distribution of attempts made per job (1 = first-try success).',
  labelNames: ['queue'] as const,
  buckets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  registers: [register],
});

// Collect Node.js default metrics (process_cpu_seconds_total, heap stats, etc.)
collectDefaultMetrics({ register });
