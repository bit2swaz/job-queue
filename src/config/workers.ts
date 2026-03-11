/**
 * concurrency and rate-limiter config for all named workers.
 *
 * these values are the defaults used by createWorker() when no explicit
 * concurrency is provided. tune per-queue based on job heaviness:
 *   - email: 5  (fast, i/o light)
 *   - report: 3 (cpu/memory heavier, generates files)
 *   - notify: 10 (simple http POSTs, can fan out widely)
 */
export const WORKER_CONCURRENCY: Record<string, number> = {
  email: 5,
  report: 3,
  notify: 10,
};

export const WORKER_LIMITER = {
  max: 100,
  duration: 1000,
} as const;
