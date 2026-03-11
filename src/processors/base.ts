import type { Job } from 'bullmq';

/**
 * base processor interface.
 *
 * all processors are typed async functions of this shape.
 * they receive a BullMQ `Job` for metadata and progress reporting
 * but contain no runtime BullMQ coupling beyond `job.log` and `job.updateProgress`.
 */
export interface BaseProcessor<TData = unknown, TResult = unknown> {
  (job: Job<TData>): Promise<TResult>;
}

/**
 * bundles a typed job reference for use in helper utilities.
 */
export type JobContext<TData = unknown> = {
  job: Job<TData>;
};
