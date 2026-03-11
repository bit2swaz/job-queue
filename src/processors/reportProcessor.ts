import type { Job } from 'bullmq';
import type { BaseProcessor } from './base';
import { ValidationError } from './errors';

const ALLOWED_REPORT_TYPES = ['summary', 'detailed', 'audit', 'analytics'] as const;
type ReportType = (typeof ALLOWED_REPORT_TYPES)[number];

export interface ReportJobData {
  reportType: string;
  userId: string;
  filters?: Record<string, unknown>;
  format: 'pdf' | 'csv';
}

export interface ReportJobResult {
  reportUrl: string;
  generatedAt: number;
}

/**
 * processes report generation jobs.
 *
 * validates that `reportType` belongs to the allowed set, then simulates
 * report generation. reports progress at 0%, 25%, 75%, and 100%.
 *
 * @throws ValidationError if `reportType` is not in the allowed set
 * @returns reportUrl path string and generatedAt unix timestamp (ms) on success
 */
export const reportProcessor: BaseProcessor<ReportJobData, ReportJobResult> = async (
  job: Job<ReportJobData>,
): Promise<ReportJobResult> => {
  const { reportType, userId, format } = job.data;

  if (!ALLOWED_REPORT_TYPES.includes(reportType as ReportType)) {
    throw new ValidationError(
      `invalid reportType "${reportType}". allowed values: ${ALLOWED_REPORT_TYPES.join(', ')}`,
    );
  }

  await job.updateProgress(0);
  await job.log(`generating ${reportType} report for user ${userId}`);

  // simulated report generation
  await job.updateProgress(25);
  await job.updateProgress(75);

  const reportUrl = `/reports/${userId}/${reportType}-${Date.now()}.${format}`;
  const generatedAt = Date.now();

  await job.updateProgress(100);
  await job.log(`report generated: ${reportUrl}`);

  return { reportUrl, generatedAt };
};
