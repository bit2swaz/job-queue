/**
 * Job management routes — all require a valid JWT.
 *
 * POST   /jobs/:queue          → 202 submit job
 * GET    /jobs/:queue/:id      → 200 job status / 404 not found
 * DELETE /jobs/:queue/:id      → 200 cancelled / 404 not found / 409 not waiting
 */
import { Router, type Request, type Response } from 'express';
import type { JobsOptions } from 'bullmq';
import { getQueue } from '../queues/queueManager';
import { KNOWN_QUEUES, type KnownQueue } from '../workers/workerManager';
import { validateBody } from '../middleware/validate';
import { submitJobSchema, type SubmitJobBody } from '../schemas/jobSchemas';
import { logger } from '../utils/logger';

export const jobsRouter = Router();

// ── shared helper ─────────────────────────────────────────────────────────────

/**
 * Validates that `:queue` is a known queue name.
 * Sends 400 and returns false when unknown.
 */
function assertKnownQueue(queueName: string, res: Response): queueName is KnownQueue {
  if (!(KNOWN_QUEUES as string[]).includes(queueName)) {
    res.status(400).json({ error: `unknown queue: ${queueName}` });
    return false;
  }
  return true;
}

/** Build a BullMQ-compatible options object, omitting undefined fields. */
function buildJobsOptions(opts: SubmitJobBody['opts']): JobsOptions {
  if (!opts) {
    return {};
  }
  const result: JobsOptions = {};
  if (opts.priority !== undefined) {
    result.priority = opts.priority;
  }
  if (opts.delay !== undefined) {
    result.delay = opts.delay;
  }
  if (opts.attempts !== undefined) {
    result.attempts = opts.attempts;
  }
  return result;
}

// ── POST /jobs/:queue ─────────────────────────────────────────────────────────

jobsRouter.post(
  '/:queue',
  validateBody(submitJobSchema),
  async (req: Request, res: Response): Promise<void> => {
    const queueName = req.params['queue'] as string;

    if (!assertKnownQueue(queueName, res)) {
      return;
    }

    const { data, opts } = req.body as SubmitJobBody;
    const q = getQueue(queueName);
    const job = await q.add(queueName, data, buildJobsOptions(opts));

    logger.info({ jobId: job.id, queue: queueName }, 'job submitted via API');

    res.status(202).json({
      jobId: job.id,
      queue: queueName,
      status: 'queued',
    });
  },
);

// ── GET /jobs/:queue/:id ──────────────────────────────────────────────────────

jobsRouter.get('/:queue/:id', async (req: Request, res: Response): Promise<void> => {
  const queueName = req.params['queue'] as string;
  const jobId = req.params['id'] as string;

  if (!assertKnownQueue(queueName, res)) {
    return;
  }

  const q = getQueue(queueName);
  const job = await q.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: `job ${jobId} not found in queue ${queueName}` });
    return;
  }

  const state = await job.getState();

  res.status(200).json({
    jobId: job.id,
    queue: queueName,
    state,
    progress: job.progress,
    data: job.data,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
    attemptsMade: job.attemptsMade,
    opts: job.opts,
  });
});

// ── DELETE /jobs/:queue/:id ───────────────────────────────────────────────────

jobsRouter.delete('/:queue/:id', async (req: Request, res: Response): Promise<void> => {
  const queueName = req.params['queue'] as string;
  const jobId = req.params['id'] as string;

  if (!assertKnownQueue(queueName, res)) {
    return;
  }

  const q = getQueue(queueName);
  const job = await q.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: `job ${jobId} not found in queue ${queueName}` });
    return;
  }

  const state = await job.getState();

  if (state !== 'waiting' && state !== 'delayed') {
    res.status(409).json({
      error: `cannot cancel job in state: ${state}`,
      state,
    });
    return;
  }

  await job.remove();
  logger.info({ jobId: job.id, queue: queueName }, 'job cancelled via API');

  res.status(200).json({ jobId: job.id, queue: queueName, cancelled: true });
});
