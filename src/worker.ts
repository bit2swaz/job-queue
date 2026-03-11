/**
 * worker process entrypoint.
 *
 * starts all three workers (email, report, notify) and registers
 * graceful shutdown handlers for SIGTERM and SIGINT.
 *
 * run with:
 *   npm run start:worker
 *   node dist/worker.js
 */

import { startEmailWorker } from './workers/emailWorker';
import { startReportWorker } from './workers/reportWorker';
import { startNotifyWorker } from './workers/notifyWorker';
import { getQueue } from './queues/queueManager';
import { getRedisClient } from './services/redisClient';
import { registerShutdownHandlers } from './utils/shutdown';
import { logger } from './utils/logger';
import { KNOWN_QUEUES } from './workers/workerManager';

const emailWorker = startEmailWorker();
const reportWorker = startReportWorker();
const notifyWorker = startNotifyWorker();

const workers = [emailWorker, reportWorker, notifyWorker];
const queues = KNOWN_QUEUES.map((name) => getQueue(name));
const redisClient = getRedisClient();

registerShutdownHandlers(workers, queues, redisClient);

logger.info(
  {
    workers: KNOWN_QUEUES.map((name, i) => ({
      queue: name,
      concurrency: workers[i]?.opts.concurrency,
    })),
  },
  'worker process started',
);
