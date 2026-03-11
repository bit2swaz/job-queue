import type { Job } from 'bullmq';
import type { BaseProcessor } from './base';
import { TransientError } from './errors';
import { validateUrl } from './validators';

export interface NotifyJobData {
  webhookUrl: string;
  event: string;
  payload: Record<string, unknown>;
  retryOnFail?: boolean;
}

export interface NotifyJobResult {
  statusCode: number;
  responseTime: number;
}

/**
 * processes webhook notification jobs.
 *
 * validates that `webhookUrl` is an absolute http/https url, then POSTs
 * the event payload using the native Node.js fetch api.
 *
 * network errors and non-2xx responses are wrapped in TransientError so
 * that the BullMQ worker retries the job according to its `attempts` setting.
 *
 * @throws ValidationError if `webhookUrl` is not a valid http/https url
 * @throws TransientError on network failure or non-2xx http response
 * @returns statusCode and responseTime (ms) on success
 */
export const notifyProcessor: BaseProcessor<NotifyJobData, NotifyJobResult> = async (
  job: Job<NotifyJobData>,
): Promise<NotifyJobResult> => {
  const { webhookUrl, event, payload } = job.data;

  validateUrl(webhookUrl, 'webhookUrl');

  await job.log(`posting event "${event}" to ${webhookUrl}`);

  const start = Date.now();
  let response: Response;

  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload }),
    });
  } catch (err) {
    throw new TransientError(
      `webhook request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const responseTime = Date.now() - start;

  if (!response.ok) {
    throw new TransientError(`webhook returned ${response.status}: ${response.statusText}`);
  }

  await job.log(`webhook delivered, status: ${response.status}, responseTime: ${responseTime}ms`);

  return { statusCode: response.status, responseTime };
};
