/**
 * Bull-Board dashboard setup.
 *
 * Creates a Bull-Board instance backed by BullMQ adapters for all four named
 * queues (email, report, notify, dlq) and exposes the Express server adapter
 * to be mounted in src/app.ts.
 *
 * Mount example:
 *   app.use('/admin/queues', jwtMiddleware, serverAdapter.getRouter());
 */

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue, reportQueue, notifyQueue, dlq } from '../queues/queues';

/** Express adapter wired to the Bull-Board instance. */
export const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(reportQueue),
    new BullMQAdapter(notifyQueue),
    new BullMQAdapter(dlq),
  ],
  serverAdapter,
});
