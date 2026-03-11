# Job Queue & Worker System (Node.js)

## Overview

A production-grade background job processing system built on BullMQ and Redis. Supports priority queues, retries with exponential backoff, dead-letter queues, scheduled/cron jobs, and a real-time dashboard. Secured REST API for job submission and status tracking.

## Stack

| Layer            | Tech                     |
| ---------------- | ------------------------ |
| Runtime          | Node.js 20 (LTS)         |
| Framework        | Express.js               |
| Queue Engine     | BullMQ                   |
| Broker           | Redis 7                  |
| Auth             | JWT                      |
| Dashboard        | Bull-Board               |
| Observability    | Prometheus + prom-client |
| Containerization | Docker + Docker Compose  |
| Testing          | Jest + Supertest         |
| Language         | TypeScript               |

## Architecture

```
                    REST API
                  (job submission)
                       │
                       ▼
             ┌─────────────────┐
             │   Job Router    │  POST /jobs/:queue
             └────────┬────────┘
                      │
                      ▼
             ┌─────────────────┐
             │     BullMQ      │  Priority queues, delay, repeat
             │      Queue      │
             └────────┬────────┘
                      │
             ┌────────┴────────┐
             │                 │
             ▼                 ▼
     ┌──────────────┐  ┌──────────────┐
     │   Worker 1   │  │   Worker N   │  Horizontal scaling
     │  (process)   │  │  (process)   │
     └──────┬───────┘  └──────┬───────┘
            │                  │
            ▼                  ▼
     ┌─────────────────────────────┐
     │          Redis              │  Job state machine
     │  (queue, results, DLQ)      │
     └─────────────────────────────┘
            │
            ▼
     ┌─────────────┐    ┌───────────┐
     │  Bull-Board │    │ Prometheus│
     │  Dashboard  │    │  /metrics │
     └─────────────┘    └───────────┘
```

## Job State Machine

```
WAITING → ACTIVE → COMPLETED
              │
              └──(fail)──► FAILED
                              │
                    (attempts left?) → WAITING (retry)
                              │
                    (no attempts left) → DEAD LETTER QUEUE
```

## Directory Structure

```
job-queue/
├── src/
│   ├── queues/
│   │   ├── queueManager.ts      # BullMQ Queue factory, registry
│   │   └── queues.ts            # Named queue definitions (email, report, notify)
│   ├── workers/
│   │   ├── workerManager.ts     # Worker factory, concurrency config
│   │   ├── emailWorker.ts       # Example: send email job handler
│   │   ├── reportWorker.ts      # Example: generate PDF report handler
│   │   └── notifyWorker.ts      # Example: webhook notification handler
│   ├── processors/
│   │   ├── emailProcessor.ts    # Business logic for email jobs
│   │   ├── reportProcessor.ts   # Business logic for report jobs
│   │   └── base.ts              # BaseProcessor interface
│   ├── routes/
│   │   ├── jobs.ts              # POST /jobs/:queue, GET /jobs/:id
│   │   └── health.ts            # GET /health (queue depth, worker status)
│   ├── services/
│   │   └── deadLetterService.ts # DLQ consumer, alert on failure
│   ├── auth/
│   │   └── jwtMiddleware.ts
│   ├── observability/
│   │   └── metrics.ts           # BullMQ event hooks → Prometheus
│   ├── dashboard/
│   │   └── board.ts             # Bull-Board setup
│   └── index.ts
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.worker        # Separate worker image (scale independently)
│   └── docker-compose.yml
├── tests/
│   ├── queue.test.ts
│   ├── worker.test.ts
│   └── api.test.ts
├── .env.example
└── README.md
```

## Core Implementation Details

### 1. Queue Manager

```typescript
// src/queues/queueManager.ts
import { Queue, QueueOptions } from 'bullmq';
import { redis } from '../services/redisClient';

const queues = new Map<string, Queue>();

export function getQueue(name: string, opts?: QueueOptions): Queue {
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 }, // 1s, 2s, 4s
          removeOnComplete: { count: 1000 },
          removeOnFail: false, // keep failed jobs for inspection
        },
        ...opts,
      }),
    );
  }
  return queues.get(name)!;
}

// Queue definitions
export const emailQueue = getQueue('email');
export const reportQueue = getQueue('report', {
  defaultJobOptions: { priority: 10, attempts: 5 }, // higher priority
});
export const notifyQueue = getQueue('notify');
export const dlq = getQueue('dead-letter'); // Dead letter queue
```

### 2. Worker Manager

```typescript
// src/workers/workerManager.ts
import { Worker, WorkerOptions } from 'bullmq';
import { emailProcessor } from '../processors/emailProcessor';
import { reportProcessor } from '../processors/reportProcessor';

const QUEUE_PROCESSOR_MAP = {
  email: emailProcessor,
  report: reportProcessor,
  notify: notifyProcessor,
};

export function createWorker(queueName: string, concurrency = 5): Worker {
  return new Worker(
    queueName,
    async (job) => {
      const processor = QUEUE_PROCESSOR_MAP[queueName];
      if (!processor) throw new Error(`No processor for queue: ${queueName}`);
      return processor(job);
    },
    {
      connection: redis,
      concurrency,
      limiter: { max: 100, duration: 1000 }, // 100 jobs/sec max
    },
  );
}

// Hook events into Prometheus metrics
export function attachMetrics(worker: Worker) {
  worker.on('completed', (job) => {
    jobsCompleted.inc({ queue: worker.name });
    jobDuration.observe({ queue: worker.name }, job.processedOn! - job.timestamp);
  });
  worker.on('failed', (job, err) => {
    jobsFailed.inc({ queue: worker.name });
  });
  worker.on('active', () => {
    activeJobs.inc({ queue: worker.name });
  });
}
```

### 3. Base Processor Interface

```typescript
// src/processors/base.ts
import { Job } from 'bullmq';

export interface BaseProcessor<T = any, R = any> {
  (job: Job<T>): Promise<R>;
}

// Example: Email processor
// src/processors/emailProcessor.ts
export const emailProcessor: BaseProcessor<EmailJobData, void> = async (job) => {
  const { to, subject, body } = job.data;
  job.log(`Sending email to ${to}`); // BullMQ job-level logging
  await job.updateProgress(50);
  // ... send email via nodemailer/sendgrid
  await job.updateProgress(100);
};

interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
}
```

### 4. Jobs REST API

```typescript
// src/routes/jobs.ts
import { Router } from 'express';
import { getQueue } from '../queues/queueManager';

const router = Router();

// Submit a job
// POST /jobs/:queue
// Body: { data: {...}, opts: { priority, delay, repeat } }
router.post('/:queue', jwtMiddleware, async (req, res) => {
  const { queue } = req.params;
  const { data, opts = {} } = req.body;

  const q = getQueue(queue);
  const job = await q.add(`${queue}-job`, data, {
    priority: opts.priority,
    delay: opts.delay, // delayed execution (ms)
    repeat: opts.repeat // cron: { pattern: '0 * * * *' }
      ? { pattern: opts.repeat }
      : undefined,
  });

  res.status(202).json({ jobId: job.id, queue, status: 'queued' });
});

// Get job status + result
// GET /jobs/:queue/:id
router.get('/:queue/:id', jwtMiddleware, async (req, res) => {
  const job = await getQueue(req.params.queue).getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const state = await job.getState();
  res.json({
    id: job.id,
    state,
    progress: job.progress,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    logs: await job.getLogs(),
  });
});

export default router;
```

### 5. Dead Letter Queue Handler

```typescript
// src/services/deadLetterService.ts
// Consumes failed jobs from all queues and routes to DLQ
import { QueueEvents } from 'bullmq';

export function watchForDeadLetters(queueName: string) {
  const events = new QueueEvents(queueName, { connection: redis });

  events.on('failed', async ({ jobId, failedReason }) => {
    const job = await getQueue(queueName).getJob(jobId);
    if (!job || job.attemptsMade < job.opts.attempts!) return;

    // Max attempts exhausted → move to DLQ
    await dlq.add('dead-letter', {
      originalQueue: queueName,
      jobId,
      data: job.data,
      failedReason,
      failedAt: Date.now(),
    });

    console.error(`[DLQ] Job ${jobId} from ${queueName} moved to dead letter queue`);
    // TODO: send alert (PagerDuty, Slack webhook, etc.)
  });
}
```

### 6. Bull-Board Dashboard

```typescript
// src/dashboard/board.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue, reportQueue, notifyQueue, dlq } from '../queues/queueManager';

const serverAdapter = new ExpressAdapter();
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

export { serverAdapter };
// Mount: app.use('/admin/queues', jwtMiddleware, serverAdapter.getRouter());
```

### 7. Docker Compose (separate worker scaling)

```yaml
# docker/docker-compose.yml
version: '3.9'
services:
  api:
    build: { context: ., dockerfile: docker/Dockerfile }
    ports: ['3000:3000']
    environment:
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - MODE=api
    depends_on:
      redis: { condition: service_healthy }

  worker:
    build: { context: ., dockerfile: docker/Dockerfile.worker }
    environment:
      - REDIS_URL=redis://redis:6379
      - MODE=worker
      - WORKER_CONCURRENCY=10
    depends_on:
      redis: { condition: service_healthy }
    deploy:
      replicas: 3 # Scale workers independently from API

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      retries: 5
    volumes:
      - redis_data:/data

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports: ['9090:9090']

volumes:
  redis_data:
```

## API Reference

| Method | Endpoint         | Auth | Description                                |
| ------ | ---------------- | ---- | ------------------------------------------ |
| POST   | /auth/token      | none | Issue JWT                                  |
| POST   | /jobs/:queue     | JWT  | Submit job (priority, delay, cron support) |
| GET    | /jobs/:queue/:id | JWT  | Job status + progress + logs               |
| DELETE | /jobs/:queue/:id | JWT  | Cancel pending job                         |
| GET    | /health          | none | Queue depths, worker status                |
| GET    | /metrics         | none | Prometheus metrics                         |
| GET    | /admin/queues    | JWT  | Bull-Board dashboard                       |

## Environment Variables

```env
PORT=3000
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret
WORKER_CONCURRENCY=10
```

## Resume Bullet Points (copy-paste ready)

- Built a distributed job queue system in Node.js/TypeScript using BullMQ and Redis, supporting priority lanes, exponential backoff retries, and dead-letter queue routing for exhausted jobs
- Implemented scheduled and cron-based job execution; exposed REST API for job submission, status polling, and progress tracking with per-job logging
- Separated API and Worker processes into independently scalable Docker services; orchestrated with Docker Compose using replica support
- Instrumented worker lifecycle events (completed, failed, active) into Prometheus metrics; integrated Bull-Board for real-time queue visualization
