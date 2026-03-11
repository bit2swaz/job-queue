import { logger } from '../utils/logger';

/**
 * shape of a job that has been routed to the dead-letter queue.
 * carries full context from the original failure so it can be inspected
 * and replayed without data loss.
 */
export interface DLQJobData {
  /** name of the queue the job originally came from */
  originalQueue: string;
  /** id of the job in the original queue */
  jobId: string;
  /** original job payload */
  data: unknown;
  /** human-readable failure message from bullmq */
  failedReason: string;
  /** unix timestamp (ms) when the job was routed to the dlq */
  failedAt: number;
}

/**
 * a function called whenever a job is routed to the dead-letter queue.
 * async to support i/o-heavy integrations (slack, pagerduty, etc.).
 */
export type AlertHook = (dlqJob: DLQJobData) => Promise<void>;

const hooks: AlertHook[] = [];

/**
 * registers a hook to be called whenever a job is permanently failed
 * and routed to the dead-letter queue.
 *
 * @param hook - the function to register
 */
export function registerAlertHook(hook: AlertHook): void {
  hooks.push(hook);
}

/**
 * invokes all registered alert hooks with the given dlq job data.
 * errors thrown by individual hooks are caught and logged - they do not
 * prevent other hooks from running or propagate to the caller.
 *
 * @param dlqJob - the dead-letter job payload
 */
export async function notifyAlerts(dlqJob: DLQJobData): Promise<void> {
  await Promise.all(
    hooks.map(async (hook) => {
      try {
        await hook(dlqJob);
      } catch (err) {
        logger.error({ err, jobId: dlqJob.jobId }, 'alert hook threw an error');
      }
    }),
  );
}

/**
 * built-in alert hook: logs the dlq event via the structured logger.
 * always registered on module load.
 */
export const consoleAlertHook: AlertHook = async (dlqJob: DLQJobData): Promise<void> => {
  logger.error(
    {
      jobId: dlqJob.jobId,
      originalQueue: dlqJob.originalQueue,
      failedReason: dlqJob.failedReason,
    },
    'alert: job moved to dead-letter queue',
  );
};

/**
 * built-in alert hook: posts a message to the slack webhook configured
 * in the SLACK_WEBHOOK_URL environment variable.
 * no-ops silently when the variable is not set.
 */
export const slackAlertHook: AlertHook = async (dlqJob: DLQJobData): Promise<void> => {
  const webhookUrl = process.env['SLACK_WEBHOOK_URL'];
  if (!webhookUrl) {
    return;
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: `job failed permanently: *${dlqJob.jobId}* from queue *${dlqJob.originalQueue}*\nreason: ${dlqJob.failedReason}`,
    }),
  });
};

// register the console hook by default so every deployment gets baseline alerting
registerAlertHook(consoleAlertHook);
