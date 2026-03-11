/**
 * Health check route — public, no auth.
 *
 * GET /health
 *   200 → { status: 'ok', redis: 'ok', queues: { [name]: { waiting, active, failed } } }
 *   503 → { status: 'error', redis: 'error' }
 */
import { Router, type Request, type Response } from 'express';
import { getRedisClient } from '../services/redisClient';
import { getQueue } from '../queues/queueManager';
import { KNOWN_QUEUES } from '../workers/workerManager';

export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Verifies Redis connectivity and returns per-queue job counts.
 *     tags: [System]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 redis:
 *                   type: string
 *                   example: ok
 *                 queues:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       waiting: { type: integer }
 *                       active: { type: integer }
 *                       failed: { type: integer }
 *       503:
 *         description: Redis unreachable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
healthRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    // verify redis is reachable
    const redis = getRedisClient();
    await redis.ping();

    // gather per-queue counts
    const queueStats: Record<string, { waiting: number; active: number; failed: number }> = {};
    await Promise.all(
      KNOWN_QUEUES.map(async (name) => {
        const q = getQueue(name);
        const counts = await q.getJobCounts('waiting', 'active', 'failed');
        queueStats[name] = {
          waiting: counts['waiting'] ?? 0,
          active: counts['active'] ?? 0,
          failed: counts['failed'] ?? 0,
        };
      }),
    );

    res.status(200).json({
      status: 'ok',
      redis: 'ok',
      queues: queueStats,
    });
  } catch {
    res.status(503).json({ status: 'error', redis: 'error' });
  }
});
