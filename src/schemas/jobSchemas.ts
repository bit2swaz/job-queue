/**
 * Zod schemas for job submission request bodies.
 */
import { z } from 'zod';

/** Optional job scheduling / priority options the caller may pass. */
export const jobOptsSchema = z
  .object({
    priority: z.number().int().min(1).optional(),
    delay: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60 * 60 * 1000)
      .optional(), // max 7 days
    attempts: z.number().int().min(1).max(10).optional(),
  })
  .optional();

/**
 * Body schema for POST /jobs/:queue
 *
 * - `data`           — arbitrary job payload (required)
 * - `opts`           — optional scheduling overrides
 * - `idempotencyKey` — optional caller-supplied jobId; BullMQ will not create
 *                      a duplicate if a job with this ID already exists in the
 *                      queue.
 */
export const submitJobSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  opts: jobOptsSchema,
  idempotencyKey: z.string().optional(),
});

export type SubmitJobBody = z.infer<typeof submitJobSchema>;
export type JobOpts = z.infer<typeof jobOptsSchema>;
