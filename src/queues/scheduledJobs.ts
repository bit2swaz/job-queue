/**
 * Cron / Scheduled Job helpers.
 *
 * Thin wrappers around BullMQ's upsertJobScheduler / removeJobScheduler.
 * All schedulers are keyed by `jobName` so callers can reference them without
 * needing to track an opaque scheduler ID separately.
 */

import { getQueue } from './queueManager';

/**
 * Registers (or updates) a recurring job on the named queue.
 *
 * Uses BullMQ's `upsertJobScheduler` — safe to call multiple times with the
 * same `jobName`; subsequent calls update the existing scheduler (no
 * duplicates).
 *
 * @param queueName   Target queue (must be reachable via getQueue).
 * @param jobName     Human-readable job name; also used as the scheduler key.
 * @param data        Job payload template forwarded to every triggered job.
 * @param cronPattern Standard 5- or 6-field cron expression
 *                    (e.g. `'0 9 * * 1-5'` = weekdays at 09:00).
 * @param tz          Optional IANA timezone for the cron pattern
 *                    (e.g. `'America/New_York'`). Defaults to UTC.
 */
export async function scheduleRecurringJob(
  queueName: string,
  jobName: string,
  data: Record<string, unknown>,
  cronPattern: string,
  tz?: string,
): Promise<void> {
  const queue = getQueue(queueName);

  const repeatOpts: { pattern: string; tz?: string } = { pattern: cronPattern };
  if (tz !== undefined) {
    repeatOpts.tz = tz;
  }

  await queue.upsertJobScheduler(
    jobName, // schedulerId — uniquely identifies this scheduler
    repeatOpts,
    { name: jobName, data },
  );
}

/**
 * Removes a recurring job scheduler from the named queue.
 *
 * If the scheduler does not exist this is a no-op (BullMQ returns false
 * silently; we don't surface that to callers).
 *
 * @param queueName Target queue.
 * @param jobName   Must match the `jobName` passed to `scheduleRecurringJob`.
 */
export async function removeScheduledJob(queueName: string, jobName: string): Promise<void> {
  const queue = getQueue(queueName);
  await queue.removeJobScheduler(jobName);
}
