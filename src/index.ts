/**
 * Application entry point.
 *
 * Starts the HTTP server, registers worker dead-letter watchers,
 * and registers graceful shutdown handlers.
 */
import { createApp } from './app';
import { KNOWN_QUEUES } from './workers/workerManager';
import { watchForDeadLetters } from './services/deadLetterService';
import { getRedisClient } from './services/redisClient';
import { getQueue } from './queues/queueManager';
import { registerShutdownHandlers } from './utils/shutdown';
import { logger } from './utils/logger';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

const app = createApp();

// Start watching for dead letters on all known queues
KNOWN_QUEUES.forEach((name) => watchForDeadLetters(name));

// Graceful shutdown (no workers in index — workers run in worker.ts process)
const queues = KNOWN_QUEUES.map((name) => getQueue(name));
registerShutdownHandlers([], queues, getRedisClient());

app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env['NODE_ENV'] ?? 'development' }, 'HTTP server started');
});
