# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.0.0] - 2026-03-12

### Added

**Infrastructure**

- Redis 7 connection via `ioredis` singleton with `lazyConnect`, `maxRetriesPerRequest: null`, and graceful reconnect handling
- `getRedisClient()` factory with connection health check (`PING`)
- `GET /health` endpoint that reports Redis latency and per-queue depth

**Queue Management**

- BullMQ `Queue` factory with named registry (`getQueue`, `getAllQueues`)
- Four built-in queues: `email`, `report`, `notify`, and `dlq` (dead-letter queue)
- Per-queue default job options (attempts, backoff, removeOnComplete, removeOnFail)

**Processors**

- `emailProcessor`, `reportProcessor`, `notifyProcessor` — pure functions with no BullMQ coupling
- `BaseProcessor` interface for type-safe processor registration
- Input validation helpers in `src/processors/validators.ts`
- Typed error hierarchy in `src/processors/errors.ts` (`ProcessorError`, `ValidationError`, `TransientError`)

**Worker Manager**

- `createWorker(queueName, processor, opts?)` factory with Prometheus metrics attachment
- Configurable concurrency and rate limiting per queue (`src/config/workers.ts`)
- Worker event hooks: `completed`, `failed`, `active`, `drained`
- Graceful shutdown handler (`SIGTERM` / `SIGINT` → `worker.close()`)

**Dead-Letter Queue**

- Auto-routing of permanently failed jobs (maxAttempts exhausted) to `dlq` queue
- `deadLetterService.ts`: `routeToDLQ(job, error)`, `replayDLQJobs(limit?)`, `getDLQStats()`
- Alert hook integration via `alertService.ts`

**REST API (Express v5)**

- `createApp()` factory (no `listen`) for testability
- JWT auth via `POST /auth/token` (HS256, configurable TTL)
- `jwtMiddleware` verifies Bearer tokens on all protected routes
- `POST /jobs/:queue` — submit jobs with optional `opts` and `idempotencyKey`
- `GET /jobs/:queue/:id` — job state, progress, return value, failure reason
- `DELETE /jobs/:queue/:id` — cancel a waiting or delayed job
- Zod body validation on all routes
- Helmet, CORS, and express-rate-limit middleware

**Advanced Queue Features (Phase 7)**

- Delayed jobs: `opts.delay` (ms)
- Priority queues: `opts.priority` (lower number = higher priority)
- Exponential backoff: `opts.backoff.type: 'exponential'`
- Deduplication via `idempotencyKey` → `jobId`
- Cron scheduling: `scheduleRecurringJob(queueName, jobName, data, cronPattern, tz?)`
- Remove scheduled job: `removeScheduledJob(queueName, jobName)`

**Observability (Phase 8)**

- `prom-client` Prometheus registry with `collectDefaultMetrics`
- Counters: `jobs_completed_total`, `jobs_failed_total` (labelled by queue)
- Gauges: `jobs_active_current`, `queue_waiting_jobs`, `queue_active_jobs`, `queue_failed_jobs`
- Histogram: `job_duration_seconds` (labelled by queue)
- Counter: `job_attempts_total` (labelled by queue)
- `attachMetrics(worker)` wires worker lifecycle events to metrics
- `startQueueScraper(intervalMs?)` / `stopQueueScraper()` for periodic queue depth polling
- `GET /metrics` — Prometheus text exposition format (public)

**Bull-Board Dashboard (Phase 9)**

- `@bull-board/api` + `@bull-board/express` integration
- `GET /admin/queues` — real-time job dashboard, JWT-protected
- All four queues registered with `BullMQAdapter`

**Docker & Containerization (Phase 10)**

- Multi-stage `Dockerfile` for API (builder → runner, non-root `node` user)
- `Dockerfile.worker` for worker process
- `docker-compose.yml` — api + worker (3 replicas) + Redis (with healthcheck) + Prometheus
- `docker-compose.test.yml` — Redis-only for CI
- `prometheus.yml` — scrapes `api:3000/metrics` every 15 s
- `.dockerignore` excludes dev artifacts

**Documentation (Phase 11)**

- `README.md` with badges, architecture diagram, quick start, API reference, env vars
- `CONTRIBUTING.md` with branch naming, commit format, PR checklist, new-queue guide
- Five Architecture Decision Records (`docs/adr/`)
- Four operational runbooks (`docs/runbooks/`)
- JSDoc / TSDoc on all public APIs

**Testing**

- 188 unit + integration tests, 1 skipped smoke test (Docker)
- Jest 30 + ts-jest with three separate project configs (unit / integration / smoke)
- 100% of new code covered by tests added in the same commit (TDD throughout)

---

[Unreleased]: https://github.com/bit2swaz/job-queue/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bit2swaz/job-queue/releases/tag/v1.0.0
