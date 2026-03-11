/**
 * Prometheus metrics endpoint.
 *
 * GET /metrics — returns the full Prometheus text exposition format.
 * Public by default; restrict via reverse proxy or add auth middleware if needed.
 */

import { Router, type Request, type Response } from 'express';
import { register } from '../observability/metrics';

export const metricsRouter = Router();

metricsRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const metrics = await register.metrics();
  res.set('Content-Type', register.contentType);
  res.status(200).send(metrics);
});
