import type { Job } from 'bullmq';
import type { BaseProcessor } from './base';
import { validateRequired } from './validators';

export interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
}

export interface EmailJobResult {
  messageId: string;
  sentAt: number;
}

/**
 * processes email send jobs.
 *
 * validates that `to`, `subject`, and `body` are present and non-empty,
 * then simulates an email send via a stub interface.
 * reports progress at 0%, 50%, and 100%.
 *
 * @throws ValidationError if any required field is missing or blank
 * @returns messageId and sentAt unix timestamp (ms) on success
 */
export const emailProcessor: BaseProcessor<EmailJobData, EmailJobResult> = async (
  job: Job<EmailJobData>,
): Promise<EmailJobResult> => {
  validateRequired(job.data, ['to', 'subject', 'body']);

  await job.updateProgress(0);
  await job.log(`sending email to ${job.data.to}, subject: ${job.data.subject}`);

  // simulated send -- replace with nodemailer/sendgrid integration in production
  await job.updateProgress(50);

  const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const sentAt = Date.now();

  await job.updateProgress(100);
  await job.log(`email sent, messageId: ${messageId}`);

  return { messageId, sentAt };
};
