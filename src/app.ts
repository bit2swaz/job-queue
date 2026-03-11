/**
 * Express application factory.
 *
 * Exports `createApp()` which builds and returns the configured Express app
 * WITHOUT calling `app.listen()`.  This pattern keeps the app fully testable
 * via supertest without binding a real port.
 */
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { jwtMiddleware } from './auth/jwtMiddleware';
import { issueToken } from './auth/tokenService';
import { healthRouter } from './routes/health';
import { jobsRouter } from './routes/jobs';
import { metricsRouter } from './routes/metrics';
import { logger } from './utils/logger';

/** Requests allowed per minute before rate-limiting kicks in. */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 100;

export function createApp(): Express {
  const app = express();

  // ── security & parsing middleware ──────────────────────────────────────────
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // ── rate limiter ───────────────────────────────────────────────────────────
  app.use(
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'too many requests, please try again later' },
    }),
  );

  // ── public routes ──────────────────────────────────────────────────────────
  app.use('/health', healthRouter);
  app.use('/metrics', metricsRouter);

  // ── auth token issuance (no auth required) ────────────────────────────────
  app.post('/auth/token', (req: Request, res: Response) => {
    const body = req.body as { sub?: unknown; role?: unknown };
    const sub = typeof body.sub === 'string' ? body.sub : 'anonymous';
    const role = typeof body.role === 'string' ? body.role : 'viewer';
    const token = issueToken(sub, role);
    res.status(200).json({ token });
  });

  // ── protected routes ───────────────────────────────────────────────────────
  app.use('/jobs', jwtMiddleware, jobsRouter);

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not found' });
  });

  // ── global error handler ──────────────────────────────────────────────────
  // Express v5 forwards thrown errors from async handlers automatically.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled application error');
    const message = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: message });
  });

  return app;
}
