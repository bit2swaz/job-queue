# Job Queue & Worker System

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.x-red)](https://bullmq.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)](docker/docker-compose.yml)

A **production-grade background job processing system** built on [BullMQ](https://bullmq.io) and Redis 7. It supports priority queues, delayed jobs, exponential backoff retries, dead-letter queue routing, cron scheduling, a secured REST API, Prometheus metrics, and a real-time Bull-Board dashboard — all in strict TypeScript with 188 passing tests.

---

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
             │     BullMQ      │  Priority, delay, repeat, deduplication
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
     │          Redis 7            │  Job state machine
     │  (queue, results, DLQ)      │
     └─────────────────────────────┘
            │
            ▼
     ┌─────────────┐    ┌───────────┐
     │  Bull-Board │    │ Prometheus│
     │ /admin/queues│    │  /metrics │
     └─────────────┘    └───────────┘
```

---

## Prerequisites

| Requirement | Version                         |
| ----------- | ------------------------------- |
| Node.js     | ≥ 20                            |
| Redis       | ≥ 7                             |
| Docker      | ≥ 24 (optional, for full stack) |

---

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/bit2swaz/job-queue.git
cd job-queue
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET

# 3. Start Redis (Docker)
docker compose -f docker/docker-compose.test.yml up -d

# 4. Start the API in dev mode
npm run dev
```

API will be available at `http://localhost:3000`.

---

## Running Workers

Workers run in a **separate process** from the API (independently scalable):

```bash
# Dev
npm run start:worker

# Production (Docker Compose — 3 replicas by default)
docker compose up worker

# Scale to 5 replicas
docker compose up --scale worker=5
```

---

## Full Stack (Docker Compose)

```bash
# Copy and edit env
cp .env.example .env

# Build and start all services (API, 3x worker, Redis, Prometheus)
docker compose -f docker/docker-compose.yml up --build

# Services:
#   API         → http://localhost:3000
#   Prometheus  → http://localhost:9090
#   Redis       → localhost:6379
```

---

## API Reference

| Method   | Endpoint           | Auth | Description                  |
| -------- | ------------------ | ---- | ---------------------------- |
| `POST`   | `/auth/token`      | —    | Issue a JWT                  |
| `POST`   | `/jobs/:queue`     | JWT  | Submit a job                 |
| `GET`    | `/jobs/:queue/:id` | JWT  | Job status, progress, result |
| `DELETE` | `/jobs/:queue/:id` | JWT  | Cancel a waiting/delayed job |
| `GET`    | `/health`          | —    | Redis ping + queue depths    |
| `GET`    | `/metrics`         | —    | Prometheus text metrics      |
| `GET`    | `/admin/queues`    | JWT  | Bull-Board dashboard UI      |

### Submit a Job

```bash
# Get a token
TOKEN=$(curl -s -XPOST http://localhost:3000/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"sub":"alice","role":"admin"}' | jq -r .token)

# Submit an email job
curl -XPOST http://localhost:3000/jobs/email \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"data":{"to":"alice@example.com","subject":"Hello","body":"World"}}'

# Submit with options
curl -XPOST http://localhost:3000/jobs/email \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "data": {"to":"bob@example.com","subject":"Delayed","body":"Hi"},
    "opts": {"delay": 5000, "priority": 1},
    "idempotencyKey": "welcome-email-bob-001"
  }'
```

### Known Queues

| Queue    | Purpose                        | Default Attempts | Default Priority |
| -------- | ------------------------------ | ---------------- | ---------------- |
| `email`  | Transactional email delivery   | 3                | —                |
| `report` | Long-running report generation | 5                | 10               |
| `notify` | Push / webhook notifications   | 3                | —                |
| `dlq`    | Dead-letter (auto-routed)      | 1                | —                |

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only (no Redis required)
npm run test:unit

# Integration tests (requires Redis on localhost:6379)
npm run test:integration

# Coverage report
npm run test:coverage

# CI: spin up Redis via Docker, then run integration tests
docker compose -f docker/docker-compose.test.yml up -d
npm run test:integration
docker compose -f docker/docker-compose.test.yml down
```

---

## Environment Variables

| Variable             | Type     | Default                  | Required | Description                           |
| -------------------- | -------- | ------------------------ | -------- | ------------------------------------- |
| `PORT`               | `number` | `3000`                   | No       | HTTP server port                      |
| `REDIS_URL`          | `string` | `redis://localhost:6379` | No       | Redis connection URL                  |
| `JWT_SECRET`         | `string` | —                        | **Yes**  | Secret for JWT signing/verification   |
| `WORKER_CONCURRENCY` | `number` | `5`                      | No       | Default workers per queue             |
| `NODE_ENV`           | `string` | `development`            | No       | `development` / `production` / `test` |

---

## Project Structure

```
src/
├── app.ts                    # Express app factory (testable, no listen)
├── index.ts                  # HTTP server entry point
├── worker.ts                 # Worker process entry point
├── auth/
│   ├── jwtMiddleware.ts      # JWT verification middleware
│   └── tokenService.ts       # JWT issuance
├── config/
│   └── workers.ts            # Concurrency + rate limiter config
├── dashboard/
│   └── board.ts              # Bull-Board setup
├── middleware/
│   └── validate.ts           # Zod body validation factory
├── observability/
│   ├── metrics.ts            # Prometheus registry + metric definitions
│   ├── workerMetrics.ts      # Worker event → metric hooks
│   └── queueScraper.ts       # Periodic queue depth scraper
├── processors/
│   ├── base.ts               # BaseProcessor interface
│   ├── emailProcessor.ts
│   ├── reportProcessor.ts
│   ├── notifyProcessor.ts
│   ├── validators.ts
│   └── errors.ts
├── queues/
│   ├── queueManager.ts       # BullMQ Queue factory + registry
│   ├── queues.ts             # Named queue singletons
│   ├── queueUtils.ts
│   └── scheduledJobs.ts      # Cron scheduling helpers
├── routes/
│   ├── health.ts
│   ├── jobs.ts
│   └── metrics.ts
├── schemas/
│   └── jobSchemas.ts         # Zod schemas for job submission
├── services/
│   ├── redisClient.ts        # ioredis singleton
│   ├── redisHealth.ts
│   ├── deadLetterService.ts  # DLQ routing + replay
│   └── alertService.ts
├── utils/
│   ├── logger.ts             # pino logger singleton
│   └── shutdown.ts           # Graceful shutdown handler
└── workers/
    ├── workerManager.ts      # Worker factory
    ├── emailWorker.ts
    ├── reportWorker.ts
    └── notifyWorker.ts
```

---

## Key Design Decisions

See [`docs/adr/`](docs/adr/) for full Architecture Decision Records.

- **BullMQ over Bull v3** — TypeScript-first, active maintenance, Redis Streams
- **ioredis** — BullMQ's recommended client, better reconnect handling
- **Separate API/Worker processes** — independent scaling and failure isolation
- **Zod validation** — runtime type safety with TypeScript inference
- **Pure processor functions** — no BullMQ coupling in business logic

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
