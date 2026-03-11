# Job Queue & Worker System — Development Roadmap

> **Methodology:** Test-Driven Development (TDD) is a first-class citizen at every phase.
> Red → Green → Refactor on all core logic. Integration tests gate phase completions.
> No phase is "done" until its tests pass and coverage targets are met.

---

## Quick Overview

| Phase | Name                      | Focus                                  | TDD Gate                      |
| ----- | ------------------------- | -------------------------------------- | ----------------------------- |
| 0     | Scaffolding & Toolchain   | Project skeleton, configs, CI baseline | Smoke test passes             |
| 1     | Redis & Connection Layer  | Redis client, health, retry logic      | Unit tests for connection     |
| 2     | Queue Manager             | Queue factory, registry, options       | Unit tests for queue creation |
| 3     | Job Processors            | Base interface + 3 processors          | Unit tests per processor      |
| 4     | Worker Manager            | Worker factory, concurrency, events    | Unit + integration tests      |
| 5     | Dead Letter Queue         | DLQ consumer, failure routing          | Integration tests             |
| 6     | REST API                  | Express, routes, JWT auth              | API tests (Supertest)         |
| 7     | Advanced Queue Features   | Cron, delay, priority, backoff         | Integration tests             |
| 8     | Observability             | Prometheus metrics, health endpoint    | Metric assertion tests        |
| 9     | Bull-Board Dashboard      | Real-time queue UI                     | Manual + smoke tests          |
| 10    | Docker & Containerization | Dockerfiles, Compose, worker scaling   | Container smoke tests         |
| 11    | Documentation & Polish    | README, API docs, architecture, JSDoc  | Doc coverage check            |

---

## Phase 0 — Scaffolding & Toolchain

> **Goal:** A clean, reproducible skeleton that every subsequent phase builds on.
> Zero business logic. 100% config and tooling.

### 0.1 — Repository & Node.js Init

- [ ] `git init` + `.gitignore` (node_modules, dist, .env, coverage/)
- [ ] `npm init -y` → set `"type": "module"` (ESM) or keep CommonJS — decide and document
- [ ] Set `"engines": { "node": ">=20" }` in `package.json`
- [ ] Create top-level folder structure matching SSOT directory tree:
  ```
  src/queues/  src/workers/  src/processors/  src/routes/
  src/services/  src/auth/  src/observability/  src/dashboard/
  tests/  docker/  docs/
  ```

### 0.2 — TypeScript Configuration

- [ ] Install: `typescript`, `ts-node`, `tsx`, `@types/node`
- [ ] `tsconfig.json`:
  - `target: ES2022`, `module: Node16`, `moduleResolution: Node16`
  - `strict: true`, `noUncheckedIndexedAccess: true`
  - `outDir: ./dist`, `rootDir: ./src`
  - `paths` aliases: `@queues/*`, `@workers/*`, `@processors/*`, etc.
- [ ] `tsconfig.build.json` (excludes tests)

### 0.3 — Linting & Formatting

- [ ] Install: `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
- [ ] Install: `prettier`, `eslint-config-prettier`
- [ ] `.eslintrc.json` — strict rules, no-any enforced, import order
- [ ] `.prettierrc` — singleQuote, trailingComma: all, printWidth: 100
- [ ] `lint-staged` + `husky` pre-commit hook (lint + format on staged files)

### 0.4 — Testing Framework Baseline

- [ ] Install: `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`
- [ ] `jest.config.ts`:
  - `preset: ts-jest`
  - `testEnvironment: node`
  - Separate projects: `unit` (tests/unit/**) and `integration` (tests/integration/**)
  - `coverageThreshold`: branches 80%, functions 90%, lines 85%
  - `moduleNameMapper` for path aliases
- [ ] `npm run test`, `npm run test:unit`, `npm run test:integration`, `npm run test:coverage`
- [ ] **TDD Gate:** Write a single failing smoke test (`tests/smoke.test.ts`) that asserts `1 === 1` — confirms Jest works

### 0.5 — Scripts & Developer Experience

- [ ] `package.json` scripts:
  ```json
  "dev": "tsx watch src/index.ts",
  "build": "tsc -p tsconfig.build.json",
  "start": "node dist/index.js",
  "start:worker": "node dist/worker.ts",
  "test": "jest",
  "test:unit": "jest --testPathPattern=tests/unit",
  "test:integration": "jest --testPathPattern=tests/integration",
  "test:coverage": "jest --coverage",
  "lint": "eslint src tests --ext .ts",
  "format": "prettier --write ."
  ```
- [ ] `.env.example`:
  ```env
  PORT=3000
  REDIS_URL=redis://localhost:6379
  JWT_SECRET=change-me-in-production
  WORKER_CONCURRENCY=10
  NODE_ENV=development
  ```
- [ ] `.env` in `.gitignore`

### 0.6 — Phase 0 Completion Gate

- [ ] `npm run lint` — zero errors
- [ ] `npm run test` — smoke test passes
- [ ] `npm run build` — compiles without error
- [ ] All directories exist per SSOT structure

---

## Phase 1 — Redis Client & Connection Layer

> **Goal:** A robust, reusable Redis connection with retry logic, tested in isolation.
> This is the foundation everything else depends on.

### 1.1 — Redis Client Module

- [ ] Install: `ioredis`, `@types/ioredis` (BullMQ's preferred Redis client)
- [ ] Create `src/services/redisClient.ts`:
  - Export a singleton `IORedis` instance
  - Read `REDIS_URL` from env
  - Configure `maxRetriesPerRequest: null` (required by BullMQ)
  - `lazyConnect: true` — don't connect at import time
  - `enableReadyCheck: false`
  - TLS support toggle via env var `REDIS_TLS=true`
- [ ] Create `src/services/redisClient.test.ts` (unit — mocked)

### 1.2 — Connection Health Utilities

- [ ] `src/services/redisHealth.ts`:
  - `pingRedis(): Promise<boolean>` — sends PING, returns true/false
  - `getRedisInfo(): Promise<Record<string, string>>` — parses INFO output
  - Graceful shutdown: `closeRedis()` — for test teardown and signal handlers

### 1.3 — TDD: Redis Client Tests

```
tests/unit/services/redisClient.test.ts
```

- [ ] **RED:** Write tests for:
  - Client initializes with correct config
  - `pingRedis()` returns `true` on success
  - `pingRedis()` returns `false` on connection refused
  - `closeRedis()` calls `.quit()`
- [ ] **GREEN:** Implement to pass
- [ ] **REFACTOR:** Extract connection options to a `getRedisConfig()` factory

### 1.4 — Integration: Live Redis Connection

```
tests/integration/redis.test.ts
```

- [ ] Requires running Redis (use `@testcontainers/redis` or `docker-compose up redis -d` in CI)
- [ ] Test: set/get key, confirm BullMQ-compatible options work
- [ ] Document: "Run `docker compose up redis -d` before integration tests"

### 1.5 — Phase 1 Completion Gate

- [ ] Unit tests: `redisClient` — all passing
- [ ] Integration test: live ping succeeds
- [ ] `npm run build` clean

---

## Phase 2 — Queue Manager

> **Goal:** A typed Queue factory and registry. Named queues with default options baked in.

### 2.1 — Queue Manager Core

- [ ] Install: `bullmq`
- [ ] Create `src/queues/queueManager.ts`:
  - `Map<string, Queue>` registry (singleton pattern)
  - `getQueue(name, opts?)`: creates-or-returns a `Queue` instance
  - Default job options per SSOT:
    - `attempts: 3`
    - `backoff: { type: 'exponential', delay: 1000 }`
    - `removeOnComplete: { count: 1000 }`
    - `removeOnFail: false`

### 2.2 — Named Queue Definitions

- [ ] Create `src/queues/queues.ts`:
  - `emailQueue` — default options
  - `reportQueue` — `priority: 10`, `attempts: 5`
  - `notifyQueue` — default options
  - `dlq` (dead-letter queue) — `removeOnFail: false`, `attempts: 1`

### 2.3 — Queue Utility Helpers

- [ ] `src/queues/queueUtils.ts`:
  - `drainQueue(name: string)` — for test teardown
  - `getQueueDepth(name: string): Promise<QueueDepth>` (waiting, active, failed counts)
  - `closeAllQueues()` — graceful shutdown

### 2.4 — TDD: Queue Manager Tests

```
tests/unit/queues/queueManager.test.ts
tests/unit/queues/queues.test.ts
```

- [ ] **RED:** Write tests for:
  - `getQueue('email')` returns a `Queue` instance
  - Calling `getQueue('email')` twice returns the same instance (singleton)
  - `reportQueue` has `priority: 10` in its default opts
  - `closeAllQueues()` calls `.close()` on every registered queue
- [ ] **GREEN:** Implement
- [ ] **REFACTOR:** Extract type for `QueueDepth`, add JSDoc

### 2.5 — Phase 2 Completion Gate

- [ ] All queue unit tests pass
- [ ] `emailQueue`, `reportQueue`, `notifyQueue`, `dlq` importable and typed
- [ ] No direct `Queue` instantiation outside `queueManager.ts`

---

## Phase 3 — Job Processors

> **Goal:** Pure, testable business logic functions. No BullMQ coupling in logic itself.
> Each processor is a typed async function — easy to unit test without a running queue.

### 3.1 — Base Processor Interface

- [ ] Create `src/processors/base.ts`:
  ```typescript
  export interface BaseProcessor<TData = unknown, TResult = unknown> {
    (job: Job<TData>): Promise<TResult>;
  }
  ```
- [ ] Export `JobContext` helper type (typed job + logger)
- [ ] Create `src/processors/index.ts` re-export barrel

### 3.2 — Email Processor

- [ ] Create `src/processors/emailProcessor.ts`:
  - Typed `EmailJobData`: `{ to, subject, body, templateId? }`
  - Validates required fields (throw `ProcessorError` on invalid data)
  - Calls `job.log()` at key steps
  - Calls `job.updateProgress(0 → 50 → 100)`
  - Simulated send (stub with `nodemailer` or a `sendEmail()` service interface)
  - Returns `{ messageId: string, sentAt: number }`

### 3.3 — Report Processor

- [ ] Create `src/processors/reportProcessor.ts`:
  - Typed `ReportJobData`: `{ reportType, userId, filters?, format: 'pdf' | 'csv' }`
  - Validates `reportType` is in allowed set
  - Progress: 0 → 25 → 75 → 100
  - Returns `{ reportUrl: string, generatedAt: number }`

### 3.4 — Notify Processor

- [ ] Create `src/processors/notifyProcessor.ts`:
  - Typed `NotifyJobData`: `{ webhookUrl, event, payload, retryOnFail? }`
  - Validates URL format
  - Uses `fetch` (Node 20 native) to POST to webhook
  - Handles non-2xx responses → throws retriable error
  - Returns `{ statusCode: number, responseTime: number }`

### 3.5 — Custom Error Types

- [ ] Create `src/processors/errors.ts`:
  - `ProcessorError extends Error` — base
  - `ValidationError extends ProcessorError` — non-retriable
  - `TransientError extends ProcessorError` — retriable (BullMQ will retry)

### 3.6 — TDD: Processor Tests

```
tests/unit/processors/emailProcessor.test.ts
tests/unit/processors/reportProcessor.test.ts
tests/unit/processors/notifyProcessor.test.ts
```

- [ ] **RED (Email):** Test missing `to` throws `ValidationError`, progress updates called, success returns `messageId`
- [ ] **RED (Report):** Invalid `reportType` throws, progress called in order, returns `reportUrl`
- [ ] **RED (Notify):** Invalid URL throws `ValidationError`, non-2xx throws `TransientError`, success returns status
- [ ] **GREEN:** Implement all processors
- [ ] **REFACTOR:** Extract shared validation utilities to `src/processors/validators.ts`

### 3.7 — Phase 3 Completion Gate

- [ ] All processor tests pass
- [ ] 100% function coverage on processors
- [ ] No BullMQ import in processor logic (processors receive `Job` type only)

---

## Phase 4 — Worker Manager

> **Goal:** Worker factory with concurrency, rate limiting, processor wiring, and event emission.

### 4.1 — Worker Factory

- [ ] Create `src/workers/workerManager.ts`:
  - `QUEUE_PROCESSOR_MAP` typed registry (queue name → processor fn)
  - `createWorker(queueName, concurrency?)` → `Worker`
  - Worker config: `connection: redis`, `concurrency`, `limiter: { max: 100, duration: 1000 }`
  - `closeAllWorkers()` — graceful drain + shutdown

### 4.2 — Individual Worker Entry Points

- [ ] `src/workers/emailWorker.ts` — calls `createWorker('email', 5)`
- [ ] `src/workers/reportWorker.ts` — calls `createWorker('report', 3)` (heavier jobs)
- [ ] `src/workers/notifyWorker.ts` — calls `createWorker('notify', 10)`

### 4.3 — Worker Entry Process (separate from API)

- [ ] Create `src/worker.ts` (separate entrypoint):
  - Starts all workers
  - Attaches metrics hooks
  - Listens for `SIGTERM`/`SIGINT` → graceful drain (wait for active jobs to finish)
  - Logs startup: queue names, concurrency levels

### 4.4 — Graceful Shutdown

- [ ] `src/utils/shutdown.ts`:
  - `registerShutdownHandlers(workers, queues, redisClient)`
  - On SIGTERM: pause workers → drain active → close queues → close redis → exit 0
  - Timeout: force exit after 30s if drain stalls

### 4.5 — TDD: Worker Manager Tests

```
tests/unit/workers/workerManager.test.ts
tests/integration/workers/worker.test.ts
```

- [ ] **RED (unit):** Mock BullMQ `Worker` — test `createWorker` calls `Worker` with correct opts, `QUEUE_PROCESSOR_MAP` throws on unknown queue
- [ ] **RED (integration):** Real Redis — add job to queue, worker picks it up, job reaches COMPLETED state
- [ ] **GREEN:** Implement
- [ ] **REFACTOR:** Extract concurrency config to `src/config/workers.ts`

### 4.6 — Phase 4 Completion Gate

- [ ] Unit tests pass with mocked BullMQ
- [ ] Integration test: job flows from `add()` → Worker → `COMPLETED`
- [ ] `src/worker.ts` starts and exits cleanly with SIGTERM

---

## Phase 5 — Dead Letter Queue (DLQ)

> **Goal:** Jobs that exhaust all retry attempts are routed to the DLQ with full context.
> Alerting hook is pluggable (Slack, PagerDuty stub).

### 5.1 — DLQ Service

- [ ] Create `src/services/deadLetterService.ts`:
  - `watchForDeadLetters(queueName: string)` — subscribes to `QueueEvents`
  - On `failed` event: check `job.attemptsMade >= job.opts.attempts`
  - If exhausted: `dlq.add('dead-letter', { originalQueue, jobId, data, failedReason, failedAt })`
  - Emit `dlq:routed` event (EventEmitter) for alerting hooks

### 5.2 — Alert Hook System

- [ ] Create `src/services/alertService.ts`:
  - `AlertHook` interface: `(dlqJob: DLQJobData) => Promise<void>`
  - `registerAlertHook(hook: AlertHook)` — pluggable
  - `notifyAlerts(dlqJob)` — calls all registered hooks
  - Stub implementations: `consoleAlertHook` (always registered), `slackAlertHook` (reads `SLACK_WEBHOOK_URL` from env)

### 5.3 — DLQ Monitoring

- [ ] `src/services/deadLetterService.ts` extended:
  - `getDLQStats()` — returns count, oldest job, most recent failure reason
  - `replayDLQJob(jobId)` — re-adds to original queue (manual recovery)

### 5.4 — TDD: DLQ Tests

```
tests/unit/services/deadLetterService.test.ts
tests/integration/dlq.test.ts
```

- [ ] **RED (unit):** Mock QueueEvents — test that `watchForDeadLetters` only routes when `attemptsMade >= attempts`, correct DLQ payload shape
- [ ] **RED (integration):** Create a processor that always throws, set `attempts: 2`, confirm job ends in DLQ after 2 failures
- [ ] **GREEN:** Implement
- [ ] **REFACTOR:** Add typed `DLQJobData` interface, add JSDoc

### 5.5 — Phase 5 Completion Gate

- [ ] DLQ routing logic unit-tested and passing
- [ ] Integration: processor failure → DLQ routing confirmed
- [ ] `replayDLQJob` tested — replayed job re-enters original queue

---

## Phase 6 — REST API

> **Goal:** Secured Express API for job submission, status polling, and cancellation.

### 6.1 — Express App Setup

- [ ] Install: `express`, `@types/express`, `helmet`, `cors`, `express-rate-limit`, `zod`
- [ ] Create `src/app.ts` (factory — no `app.listen` here, easier to test):
  - Helmet, CORS, JSON body parser, rate limiter
  - Mount routers (jobs, health, auth, metrics, dashboard)
  - Global error handler middleware
  - 404 handler
- [ ] Create `src/index.ts`:
  - Imports `app`, calls `app.listen(PORT)`
  - Calls `watchForDeadLetters` for all queues
  - Registers shutdown handlers

### 6.2 — JWT Auth Middleware

- [ ] Install: `jsonwebtoken`, `@types/jsonwebtoken`
- [ ] Create `src/auth/jwtMiddleware.ts`:
  - Reads `Authorization: Bearer <token>` header
  - Verifies with `JWT_SECRET`
  - Attaches `req.user` (typed: `{ sub, role, iat, exp }`)
  - Returns `401` on missing token, `403` on invalid/expired
- [ ] Create `src/auth/tokenService.ts`:
  - `issueToken(sub, role)` — signs JWT, 24h expiry
  - `POST /auth/token` route (no auth required)

### 6.3 — Job Routes

- [ ] Create `src/routes/jobs.ts`:
  - `POST /jobs/:queue` — submit job (JWT required)
    - Validate body with Zod: `{ data: object, opts?: { priority, delay, repeat } }`
    - Unknown queue name → 400
    - Returns `202 { jobId, queue, status: 'queued' }`
  - `GET /jobs/:queue/:id` — job status + result (JWT required)
    - Returns full state, progress, data, result, logs, attemptsMade
    - Job not found → 404
  - `DELETE /jobs/:queue/:id` — cancel pending job (JWT required)
    - Only cancels WAITING jobs
    - Already active/completed → 409

### 6.4 — Health Route

- [ ] Create `src/routes/health.ts`:
  - `GET /health` — public
  - Response: `{ status, redis: 'ok'|'error', queues: { [name]: { waiting, active, failed } } }`
  - Returns `503` if Redis is down

### 6.5 — Input Validation Layer

- [ ] Create `src/middleware/validate.ts`:
  - Generic Zod validation middleware factory
  - `validateBody(schema)` — validates `req.body`, returns 422 with Zod error details on fail
- [ ] Create `src/schemas/jobSchemas.ts`:
  - `submitJobSchema`, `jobOptsSchema`

### 6.6 — TDD: API Tests

```
tests/unit/routes/jobs.test.ts
tests/unit/routes/health.test.ts
tests/unit/auth/jwtMiddleware.test.ts
tests/integration/api.test.ts
```

- [ ] **RED (unit — auth):** Test 401 on missing token, 403 on expired token, `req.user` populated on valid token
- [ ] **RED (unit — jobs):** Test 400 on unknown queue, 422 on missing `data`, 202 on valid submit, 404 on unknown job ID
- [ ] **RED (integration):** Real Redis — submit email job via POST, poll GET until COMPLETED
- [ ] **GREEN:** Implement all routes
- [ ] **REFACTOR:** Extract queue name validation to shared util

### 6.7 — Phase 6 Completion Gate

- [ ] All route unit tests passing
- [ ] Integration test: full job lifecycle via API confirmed
- [ ] `npm run build` clean
- [ ] Rate limiting confirmed working (test 429 on >100 req/min)

---

## Phase 7 — Advanced Queue Features

> **Goal:** Cron scheduling, delayed jobs, priority lanes, and exponential backoff verified.

### 7.1 — Cron / Scheduled Jobs

- [ ] Verify `repeat: { pattern: '...' }` via BullMQ's native repeat support
- [ ] Create `src/queues/scheduledJobs.ts`:
  - `scheduleRecurringJob(queueName, jobName, data, cronPattern)` helper
  - `removeScheduledJob(queueName, jobName, cronPattern)` cleanup
- [ ] Document cron pattern format and timezone handling (`tz` option)

### 7.2 — Delayed Jobs

- [ ] Test and document `delay` option in job submission
- [ ] Add `delay` field to `submitJobSchema` (max: 7 days in ms)
- [ ] Integration test: submit job with 2s delay, confirm it doesn't process before delay elapses

### 7.3 — Priority Queue Validation

- [ ] Integration test: submit 3 jobs with priorities 1, 5, 10 — confirm processing order (10 first)
- [ ] Document priority scale (1 = lowest, higher number = higher priority in BullMQ)

### 7.4 — Exponential Backoff Verification

- [ ] Integration test: processor that fails first 2 attempts, succeeds on 3rd
  - Confirm `attemptsMade` increments
  - Confirm delays between retries follow exponential pattern (1s, 2s)
  - Confirm final state is `COMPLETED`
- [ ] Integration test: processor fails all 3 attempts → routes to DLQ

### 7.5 — Job Deduplication (Bonus)

- [ ] `jobId` option in `q.add()` for idempotent submission
- [ ] API: accept optional `idempotencyKey` in request body → set as `jobId`
- [ ] Test: submitting same `jobId` twice returns same job without duplicating

### 7.6 — TDD: Advanced Features Tests

```
tests/integration/scheduling.test.ts
tests/integration/priority.test.ts
tests/integration/backoff.test.ts
```

- [ ] All tests written before implementation where possible
- [ ] Backoff timing tests use jest fake timers where applicable

### 7.7 — Phase 7 Completion Gate

- [ ] Delayed job test passes
- [ ] Priority ordering test passes
- [ ] Backoff + DLQ routing integration test passes
- [ ] Cron job helper tested with mocked BullMQ `repeat`

---

## Phase 8 — Observability

> **Goal:** Prometheus metrics emitted from worker lifecycle events. `/metrics` endpoint live.

### 8.1 — Prometheus Metrics Setup

- [ ] Install: `prom-client`
- [ ] Create `src/observability/metrics.ts`:
  - Initialize `collectDefaultMetrics()` (Node.js process metrics)
  - Define counters/gauges/histograms:
    - `jobs_completed_total` — Counter, labels: `queue`
    - `jobs_failed_total` — Counter, labels: `queue`
    - `jobs_active_current` — Gauge, labels: `queue`
    - `job_duration_seconds` — Histogram, labels: `queue`, buckets: [0.1, 0.5, 1, 5, 30, 60]
    - `job_attempts_total` — Histogram, labels: `queue`, tracks retry count distribution
  - Export `register` (the Prometheus registry)

### 8.2 — Metrics Hooks on Workers

- [ ] Create `src/observability/workerMetrics.ts`:
  - `attachMetrics(worker: Worker)`:
    - `worker.on('completed', ...)` → inc `jobs_completed_total`, observe `job_duration_seconds`
    - `worker.on('failed', ...)` → inc `jobs_failed_total`
    - `worker.on('active', ...)` → inc `jobs_active_current`
    - `worker.on('drained', ...)` → reset active gauge for that queue
  - Duration: `job.processedOn! - job.timestamp` (ms → seconds)

### 8.3 — Metrics Endpoint

- [ ] Create `src/routes/metrics.ts`:
  - `GET /metrics` — public (or restrict with basic auth via env flag)
  - Returns `register.metrics()` with correct `Content-Type: text/plain; version=0.0.4`

### 8.4 — Queue Depth Metrics (Bonus)

- [ ] Periodic scrape of queue depths into Prometheus gauges (every 15s)
- [ ] `src/observability/queueScraper.ts`:
  - `startQueueScraper(intervalMs = 15000)`
  - Gauges: `queue_waiting_jobs`, `queue_active_jobs`, `queue_failed_jobs`

### 8.5 — TDD: Metrics Tests

```
tests/unit/observability/metrics.test.ts
tests/integration/metrics.test.ts
```

- [ ] **RED (unit):** Mock worker events — verify `jobs_completed_total` increments on `completed` event, labels are correct
- [ ] **RED (integration):** Complete 3 jobs, hit `/metrics`, parse response — assert `jobs_completed_total{queue="email"} >= 3`
- [ ] **GREEN:** Implement
- [ ] **REFACTOR:** Extract metric label helpers

### 8.6 — Phase 8 Completion Gate

- [ ] Unit tests for metric hooks pass
- [ ] Integration: `/metrics` returns valid Prometheus text format
- [ ] All 5 metric types present in response
- [ ] Default Node.js metrics also present

---

## Phase 9 — Bull-Board Dashboard

> **Goal:** Visual real-time queue monitoring UI, secured behind JWT.

### 9.1 — Bull-Board Setup

- [ ] Install: `@bull-board/api`, `@bull-board/express`
- [ ] Create `src/dashboard/board.ts`:
  - `createBullBoard` with `BullMQAdapter` for all 4 queues
  - `ExpressAdapter` with base path `/admin/queues`
  - Export `serverAdapter`

### 9.2 — Mount in Express App

- [ ] In `src/app.ts`: mount `app.use('/admin/queues', jwtMiddleware, serverAdapter.getRouter())`
- [ ] Test: GET `/admin/queues` without JWT → 401
- [ ] Test: GET `/admin/queues` with valid JWT → 200 HTML

### 9.3 — Manual Smoke Test Checklist

- [ ] Start `docker compose up`
- [ ] Issue JWT via `POST /auth/token`
- [ ] Submit jobs to each queue
- [ ] Open `/admin/queues` in browser (using token in cookie or query param workaround)
- [ ] Verify: jobs appear in Waiting, move to Active, then Completed
- [ ] Verify: DLQ jobs appear after forced failures

### 9.4 — Phase 9 Completion Gate

- [ ] Bull-Board mounted and accessible
- [ ] Auth protection confirmed (unit test)
- [ ] Manual smoke test checklist completed and signed off

---

## Phase 10 — Docker & Containerization

> **Goal:** Reproducible build. API and Workers run in separate containers.
> Docker Compose orchestrates full stack for local dev and CI.

### 10.1 — API Dockerfile

- [ ] `docker/Dockerfile`:
  - Multi-stage: `builder` (install + compile) → `runner` (production image)
  - Base: `node:20-alpine`
  - Copy only `dist/` and `package*.json` in final stage
  - `CMD ["node", "dist/index.js"]`
  - Non-root user (`node`)

### 10.2 — Worker Dockerfile

- [ ] `docker/Dockerfile.worker`:
  - Same multi-stage pattern
  - `CMD ["node", "dist/worker.js"]`
  - Different entry point than API

### 10.3 — Docker Compose

- [ ] `docker/docker-compose.yml`:
  - Services: `api`, `worker` (3 replicas), `redis`, `prometheus`
  - `MODE=api` vs `MODE=worker` env var (single image, different entry via `CMD` override)
  - Redis healthcheck: `redis-cli ping`
  - `depends_on` with `condition: service_healthy`
  - Named volume `redis_data` for persistence
  - `worker.deploy.replicas: 3`

### 10.4 — Prometheus Config

- [ ] `prometheus.yml`:
  - Scrape `api:3000/metrics` every 15s
  - Job name: `job-queue`

### 10.5 — Docker Ignore

- [ ] `.dockerignore`: `node_modules`, `dist`, `.env`, `tests`, `coverage`, `docs`

### 10.6 — CI-Friendly Compose Override

- [ ] `docker/docker-compose.test.yml`:
  - Redis only (for integration tests in CI)
  - No API or worker service

### 10.7 — TDD: Container Smoke Tests

```
tests/smoke/docker.test.ts
```

- [ ] Start `docker-compose.test.yml`, run integration test suite
- [ ] CI pipeline script: `docker compose -f docker/docker-compose.test.yml up -d && npm run test:integration`

### 10.8 — Phase 10 Completion Gate

- [ ] `docker compose build` — no errors
- [ ] `docker compose up` — all services healthy
- [ ] API reachable at `localhost:3000/health`
- [ ] Workers processing jobs (submit via API, watch logs)
- [ ] Prometheus scraping metrics (verify at `localhost:9090`)
- [ ] Worker replicas scale: `docker compose up --scale worker=5`

---

## Phase 11 — Documentation & Polish

> **Goal:** The project is only as good as its docs. This phase ensures every developer
> (and future you) can onboard, operate, and extend the system without tribal knowledge.

### 11.1 — README.md

- [ ] **Badges:** Node.js version, TypeScript, license, test status (CI badge), Docker
- [ ] **Overview:** 3-sentence project description
- [ ] **Architecture Diagram:** ASCII diagram from SSOT + Mermaid version
- [ ] **Prerequisites:** Node 20, Docker, Redis (or Docker Compose)
- [ ] **Quick Start:**
  ```bash
  cp .env.example .env
  docker compose up -d redis
  npm install
  npm run dev
  ```
- [ ] **Running Workers:** `npm run start:worker` or `docker compose up worker`
- [ ] **Running Tests:**
  - Unit: `npm run test:unit`
  - Integration (requires Redis): `npm run test:integration`
  - Coverage report: `npm run test:coverage`
- [ ] **Environment Variables:** Table of all env vars with types, defaults, required flag
- [ ] **Docker Compose:** Full stack startup, scaling workers

### 11.2 — API Documentation

- [ ] Install: `swagger-jsdoc`, `swagger-ui-express`
- [ ] Annotate all routes with JSDoc OpenAPI comments
- [ ] Mount Swagger UI at `GET /api-docs` (dev-only via `NODE_ENV !== 'production'`)
- [ ] Export `openapi.json` via `GET /api-docs.json`
- [ ] Document all request/response schemas with examples
- [ ] Document error responses (400, 401, 403, 404, 409, 422, 503)

### 11.3 — Inline Code Documentation (JSDoc/TSDoc)

- [ ] All public-facing functions in:
  - `queueManager.ts` — document `getQueue`, `closeAllQueues`
  - `workerManager.ts` — document `createWorker`, `attachMetrics`, `closeAllWorkers`
  - `deadLetterService.ts` — document `watchForDeadLetters`, `replayDLQJob`
  - `jwtMiddleware.ts` — document auth flow
  - `metrics.ts` — document each metric's meaning and labels
- [ ] TSDoc `@param`, `@returns`, `@throws`, `@example` on all public APIs
- [ ] Complex logic blocks get inline comments (why, not what)

### 11.4 — Architecture Decision Records (ADRs)

- [ ] `docs/adr/` folder
- [ ] `ADR-001`: Why BullMQ over Bull (v3) — active maintenance, TypeScript-first, streams
- [ ] `ADR-002`: Why ioredis as Redis client — BullMQ recommendation, better reconnect handling
- [ ] `ADR-003`: Why separate Worker and API processes — independent scaling, failure isolation
- [ ] `ADR-004`: Why Zod for validation — runtime type safety, TypeScript inference, good error messages
- [ ] `ADR-005`: Job processor design — pure functions, no side-effect coupling to BullMQ internals

### 11.5 — Operational Runbooks

- [ ] `docs/runbooks/`:
  - `scaling-workers.md` — how to scale workers up/down in Docker Compose and Kubernetes
  - `dlq-recovery.md` — how to inspect and replay dead-letter jobs
  - `redis-maintenance.md` — backup, restore, memory monitoring
  - `incident-response.md` — what to do when queue depth spikes, workers stall, Redis OOM

### 11.6 — CONTRIBUTING.md

- [ ] Branch naming convention: `feat/`, `fix/`, `test/`, `docs/`
- [ ] Commit message format: Conventional Commits (`feat: ...`, `fix: ...`)
- [ ] PR checklist: tests pass, coverage maintained, lint clean, docs updated
- [ ] Local dev setup walkthrough
- [ ] How to add a new queue + processor + worker (step-by-step)

### 11.7 — CHANGELOG.md

- [ ] Follows [Keep a Changelog](https://keepachangelog.com) format
- [ ] Initial entry: `[1.0.0] - 2026-03-11` with full feature list

### 11.8 — Documentation Coverage Check

- [ ] Run `typedoc --validation` — no undocumented public symbols
- [ ] All API endpoints covered in Swagger
- [ ] All ADRs written
- [ ] README quick-start verified: fresh clone → running system in < 5 minutes
- [ ] Peer review: have someone follow README from scratch, fix any gaps

### 11.9 — Phase 11 Completion Gate

- [ ] `README.md` complete and verified
- [ ] Swagger UI accessible at `/api-docs`
- [ ] All public functions have TSDoc
- [ ] All 5 ADRs written
- [ ] All 4 runbooks written
- [ ] CONTRIBUTING.md and CHANGELOG.md present

---

## Cross-Cutting Concerns (Applied Throughout All Phases)

### TDD Rules (Non-Negotiable)

1. **No production code without a failing test first** (for all core logic)
2. **Minimum coverage gates:** 80% branches, 90% functions, 85% lines
3. **Integration tests use real Redis** (via Docker) — no mocking Redis itself
4. **Mocking BullMQ is acceptable in unit tests** for fast feedback loops
5. **Each phase ends with `npm run test -- --coverage`** — must pass gate

### Code Quality Standards

- ESLint zero-warning policy in CI
- Prettier enforced on commit via `lint-staged`
- No `any` types (TypeScript strict mode)
- No `console.log` in production code (use structured logger — `pino` recommended)

### Git Discipline

- One commit per mini-phase milestone
- Commit messages follow Conventional Commits
- No broken builds on `main` branch

### Structured Logging (Add in Phase 1, use everywhere)

- Install `pino` + `pino-pretty` (dev)
- Logger singleton: `src/utils/logger.ts`
- Log levels: `error`, `warn`, `info`, `debug`
- Structured fields: `jobId`, `queue`, `duration`, `error`

---

## Phase Dependency Graph

```
Phase 0 (Scaffold)
    │
    ▼
Phase 1 (Redis)
    │
    ▼
Phase 2 (Queue Manager)
    │
    ├──────────────────┐
    ▼                  ▼
Phase 3 (Processors)  Phase 6 (API - partial, no processors yet)
    │                  │
    ▼                  │
Phase 4 (Workers) ─────┘
    │
    ├──────────────────┐
    ▼                  ▼
Phase 5 (DLQ)     Phase 7 (Advanced Features)
    │                  │
    └──────┬───────────┘
           ▼
       Phase 8 (Observability)
           │
           ▼
       Phase 9 (Dashboard)
           │
           ▼
       Phase 10 (Docker)
           │
           ▼
       Phase 11 (Documentation)
```

---

## Estimated Effort Summary

| Phase | Complexity  | Key Deliverable                          |
| ----- | ----------- | ---------------------------------------- |
| 0     | Low         | Working project skeleton                 |
| 1     | Low-Medium  | Redis client + health utils              |
| 2     | Medium      | Queue factory + 4 named queues           |
| 3     | Medium      | 3 typed processors + error hierarchy     |
| 4     | Medium-High | Worker factory + graceful shutdown       |
| 5     | Medium      | DLQ routing + alert hooks                |
| 6     | High        | Full REST API + JWT + validation         |
| 7     | Medium      | Cron, delay, priority, backoff tests     |
| 8     | Medium      | Prometheus metrics + `/metrics` endpoint |
| 9     | Low         | Bull-Board mount + auth guard            |
| 10    | Medium      | Dockerfiles + Compose + CI config        |
| 11    | Medium-High | Full docs, ADRs, runbooks, Swagger       |

---

_Last updated: 2026-03-11 | Follows SSOT.md v1.0_
