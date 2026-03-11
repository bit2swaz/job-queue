# Runbook: Scaling Workers

**Audience:** SRE / Platform engineer  
**Last updated:** 2026-03-12  
**Related:** [ADR-003](../adr/ADR-003-separate-worker-api-processes.md)

---

## Overview

Workers consume BullMQ jobs from Redis. They are stateless and horizontally scalable. This runbook covers scaling up, scaling down, and tuning concurrency.

---

## Indicators that more workers are needed

Monitor the following Prometheus metrics:

```promql
# Jobs waiting in queue (high = backlog building)
queue_waiting_jobs{queue="email"}

# Active jobs (near concurrency limit = saturated)
jobs_active_current{queue="email"}

# Job duration (p99 rising = overloaded workers or slow processors)
histogram_quantile(0.99, rate(job_duration_seconds_bucket[5m]))
```

**Recommended action:** Add workers when `queue_waiting_jobs` for any queue remains above **100** for more than **2 minutes**.

---

## Scale up: Docker Compose

```bash
# Scale to 5 worker replicas (from default 3)
docker compose -f docker/docker-compose.yml up --scale worker=5 -d

# Verify replicas are running
docker compose -f docker/docker-compose.yml ps worker
```

Workers register with BullMQ automatically. No rolling restart of the API is required.

---

## Scale down: Docker Compose

```bash
# Scale down to 2 replicas
docker compose -f docker/docker-compose.yml up --scale worker=2 -d
```

Docker Compose sends `SIGTERM` to the removed container(s). The graceful shutdown handler in `src/utils/shutdown.ts` calls `worker.close()`, which:

1. Stops accepting new jobs
2. Waits for in-flight jobs to complete (up to the `forceKillAfterMs` timeout)
3. Exits cleanly

**Default `forceKillAfterMs`:** 30 000 ms. Adjust in `src/config/workers.ts` for long-running processors.

---

## Tune concurrency without restarting

Concurrency is set per-queue in `src/config/workers.ts`. A code change and redeploy are required to change it permanently.

For a temporary in-session change without redeployment, you can use BullMQ's rate limiter to throttle how many jobs a running worker picks up:

```bash
# Reduce rate limit for the report queue to 2 jobs/10s
# (requires a code change or dynamic config from Redis — future work)
```

---

## Scale up: Kubernetes (future)

When migrating to Kubernetes, use a `HorizontalPodAutoscaler` targeting the custom metric `queue_waiting_jobs`:

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

## Verify worker health after scaling

```bash
# Check worker logs for "Worker started" and no ECONNREFUSED
docker compose logs worker --tail=50

# Confirm metrics show active workers
curl http://localhost:3000/metrics | grep jobs_active_current
```

---

## Rollback

If a new worker image causes job failures:

```bash
# Roll back to the previous image
docker compose pull worker   # pulls :latest
docker compose up worker -d  # or pin a specific tag in docker-compose.yml
```

Inspect failed jobs in Bull-Board: `http://localhost:3000/admin/queues`.
