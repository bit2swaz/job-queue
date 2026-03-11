# changelog

all notable changes to this project will be documented in this file.

the format is based on [keep a changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.0.0] - 2026-03-12

### added

**infrastructure**

- redis 7 connection via `ioredis` singleton with `lazyConnect`, `maxRetriesPerRequest: null`, and graceful reconnect handling
- `getRedisClient()` factory with connection health check (`PING`)
- `GET /health` endpoint that reports redis latency and per-queue depth

**queue management**

- bullmq `Queue` factory with named registry (`getQueue`, `getAllQueues`)
- four built-in queues: `email`, `report`, `notify`, and `dlq` (dead-letter queue)
- per-queue default job options (attempts, backoff, removeOnComplete, removeOnFail)

**processors**

- `emailProcessor`, `reportProcessor`, `notifyProcessor` - pure functions with no bullmq coupling
- `BaseProcessor` interface for type-safe processor registration
- input validation helpers in `src/processors/validators.ts`
- typed error hierarchy in `src/processors/errors.ts` (`ProcessorError`, `ValidationError`, `TransientError`)

**worker manager**

- `createWorker(queueName, processor, opts?)` factory with prometheus metrics attachment
- configurable concurrency and rate limiting per queue (`src/config/workers.ts`)
- worker event hooks: `completed`, `failed`, `active`, `drained`
- graceful shutdown handler (`SIGTERM` / `SIGINT` -> `worker.close()`)

**dead-letter queue**

- auto-routing of permanently failed jobs (maxAttempts exhausted) to `dlq` queue
- `deadLetterService.ts`: `routeToDLQ(job, error)`, `replayDLQJobs(limit?)`, `getDLQStats()`
- alert hook integration via `alertService.ts`

**rest api (express v5)**

- `createApp()` factory (no `listen`) for testability
- jwt auth via `POST /auth/token` (HS256, configurable TTL)
- `jwtMiddleware` verifies bearer tokens on all protected routes
- `POST /jobs/:queue` - submit jobs with optional `opts` and `idempotencyKey`
- `GET /jobs/:queue/:id` - job state, progress, return value, failure reason
- `DELETE /jobs/:queue/:id` - cancel a waiting or delayed job
- zod body validation on all routes
- helmet, cors, and express-rate-limit middleware

**advanced queue features (phase 7)**

- delayed jobs: `opts.delay` (ms)
- priority queues: `opts.priority` (lower number = higher priority)
- exponential backoff: `opts.backoff.type: 'exponential'`
- deduplication via `idempotencyKey` -> `jobId`
- cron scheduling: `scheduleRecurringJob(queueName, jobName, data, cronPattern, tz?)`
- remove scheduled job: `removeScheduledJob(queueName, jobName)`

**observability (phase 8)**

- `prom-client` prometheus registry with `collectDefaultMetrics`
- counters: `jobs_completed_total`, `jobs_failed_total` (labelled by queue)
- gauges: `jobs_active_current`, `queue_waiting_jobs`, `queue_active_jobs`, `queue_failed_jobs`
- histogram: `job_duration_seconds` (labelled by queue)
- counter: `job_attempts_total` (labelled by queue)
- `attachMetrics(worker)` wires worker lifecycle events to metrics
- `startQueueScraper(intervalMs?)` / `stopQueueScraper()` for periodic queue depth polling
- `GET /metrics` - prometheus text exposition format (public)

**bull-board dashboard (phase 9)**

- `@bull-board/api` + `@bull-board/express` integration
- `GET /admin/queues` - real-time job dashboard, jwt-protected
- all four queues registered with `BullMQAdapter`

**docker & containerization (phase 10)**

- multi-stage `Dockerfile` for api (builder -> runner, non-root `node` user)
- `Dockerfile.worker` for worker process
- `docker-compose.yml` - api + worker (3 replicas) + redis (with healthcheck) + prometheus
- `docker-compose.test.yml` - redis-only for ci
- `prometheus.yml` - scrapes `api:3000/metrics` every 15 s
- `.dockerignore` excludes dev artifacts

**documentation (phase 11)**

- `README.md` with badges, architecture diagram, quick start, api reference, env vars
- `CONTRIBUTING.md` with branch naming, commit format, pr checklist, new-queue guide
- five architecture decision records (`docs/adr/`)
- four operational runbooks (`docs/runbooks/`)
- JSDoc / TSDoc on all public apis

**testing**

- 188 unit + integration tests, 1 skipped smoke test (docker)
- jest 30 + ts-jest with three separate project configs (unit / integration / smoke)
- 100% of new code covered by tests added in the same commit (tdd throughout)

---

[Unreleased]: https://github.com/bit2swaz/job-queue/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bit2swaz/job-queue/releases/tag/v1.0.0
