import type { Worker, Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { logger } from './logger';

const FORCE_EXIT_TIMEOUT_MS = 30_000;

/**
 * registers SIGTERM and SIGINT handlers for graceful shutdown.
 *
 * shutdown sequence:
 *   1. pause all workers  (stop picking up new jobs)
 *   2. close all workers  (wait for active jobs to finish)
 *   3. close all queues
 *   4. quit redis client
 *   5. exit 0
 *
 * if the sequence takes longer than 30 seconds, force-exits with code 1.
 *
 * @param workers  - active Worker instances to drain and close
 * @param queues   - active Queue instances to close
 * @param redisClient - shared IORedis singleton to quit
 */
export function registerShutdownHandlers(
  workers: Worker[],
  queues: Queue[],
  redisClient: IORedis,
): void {
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutdown signal received, draining workers');

    const forceExitTimer = setTimeout(() => {
      logger.error('graceful shutdown timed out after 30s, forcing exit');
      process.exit(1);
    }, FORCE_EXIT_TIMEOUT_MS).unref();

    try {
      // step 1: pause workers - stop accepting new jobs immediately
      await Promise.all(workers.map((w) => w.pause()));

      // step 2: close workers - wait for currently active jobs to finish
      await Promise.all(workers.map((w) => w.close()));

      // step 3: close queue connections
      await Promise.all(queues.map((q) => q.close()));

      // step 4: close redis
      await redisClient.quit();

      clearTimeout(forceExitTimer);
      logger.info({ signal }, 'graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err, signal }, 'error during graceful shutdown');
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
}
