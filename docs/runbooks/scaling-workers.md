# runbook: scaling workers

**audience:** sre / platform engineer
**last updated:** 2026-03-12
**related:** [adr-003](../adr/ADR-003-separate-worker-api-processes.md)

---

## overview

workers consume bullmq jobs from redis. they are stateless and horizontally scalable. this runbook covers scaling up, scaling down, and tuning concurrency.

---

## indicators that more workers are needed

monitor the following prometheus metrics:

```promql
# jobs waiting in queue (high = backlog building)
queue_waiting_jobs{queue="email"}

# active jobs (near concurrency limit = saturated)
jobs_active_current{queue="email"}

# job duration (p99 rising = overloaded workers or slow processors)
histogram_quantile(0.99, rate(job_duration_seconds_bucket[5m]))
```

**recommended action:** add workers when `queue_waiting_jobs` for any queue remains above **100** for more than **2 minutes**.

---

## scale up: docker compose

```bash
# scale to 5 worker replicas (from default 3)
docker compose -f docker/docker-compose.yml up --scale worker=5 -d

# verify replicas are running
docker compose -f docker/docker-compose.yml ps worker
```

workers register with bullmq automatically. no rolling restart of the api is required.

---

## scale down: docker compose

```bash
# scale down to 2 replicas
docker compose -f docker/docker-compose.yml up --scale worker=2 -d
```

docker compose sends `SIGTERM` to the removed container(s). the graceful shutdown handler in `src/utils/shutdown.ts` calls `worker.close()`, which:

1. stops accepting new jobs
2. waits for in-flight jobs to complete (up to the `forceKillAfterMs` timeout)
3. exits cleanly

**default `forceKillAfterMs`:** 30 000 ms. adjust in `src/config/workers.ts` for long-running processors.

---

## tune concurrency without restarting

concurrency is set per-queue in `src/config/workers.ts`. a code change and redeploy are required to change it permanently.

for a temporary in-session change without redeployment, you can use bullmq's rate limiter to throttle how many jobs a running worker picks up:

```bash
# reduce rate limit for the report queue to 2 jobs/10s
# (requires a code change or dynamic config from redis - future work)
```

---

## scale up: kubernetes (future)

when migrating to kubernetes, use a `HorizontalPodAutoscaler` targeting the custom metric `queue_waiting_jobs`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: job-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: job-worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: External
      external:
        metric:
          name: queue_waiting_jobs
        target:
          type: AverageValue
          averageValue: '50'
```

---

## verify worker health after scaling

```bash
# check worker logs for "Worker started" and no ECONNREFUSED
docker compose logs worker --tail=50

# confirm metrics show active workers
curl http://localhost:3000/metrics | grep jobs_active_current
```

---

## rollback

if a new worker image causes job failures:

```bash
# roll back to the previous image
docker compose pull worker   # pulls :latest
docker compose up worker -d  # or pin a specific tag in docker-compose.yml
```

inspect failed jobs in bull-board: `http://localhost:3000/admin/queues`.
