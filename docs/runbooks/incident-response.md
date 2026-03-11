# Runbook: Incident Response

**Audience:** On-call engineer  
**Last updated:** 2026-03-12  
**Severity levels:** P1 (critical) · P2 (major) · P3 (minor)

---

## Quick-reference: Symptom → Action

| Symptom                                  | Likely cause                      | Runbook section                                 |
| ---------------------------------------- | --------------------------------- | ----------------------------------------------- |
| `GET /health` returns non-200            | Redis down                        | [Redis outage](#redis-outage)                   |
| Queue depth rising, no workers consuming | Workers crashed                   | [Workers not consuming](#workers-not-consuming) |
| DLQ depth growing rapidly                | Processor bug or upstream failure | [DLQ spike](#dlq-spike)                         |
| API returns 500 on job submission        | BullMQ enqueue error              | [API errors](#api-errors)                       |
| `/metrics` returns stale data            | Prometheus scrape failing         | [Metrics not updating](#metrics-not-updating)   |
| JWT errors on all requests               | Secret rotated / clock skew       | [Auth failures](#auth-failures)                 |

---

## Redis Outage

**Severity:** P1 — blocks all job submission and consumption

### Detect

```bash
# Health endpoint
curl http://localhost:3000/health

# Direct ping
redis-cli -u $REDIS_URL PING
```

### Respond

1. Check Redis container/process status:

   ```bash
   docker compose ps redis
   docker compose logs redis --tail=50
   ```

2. Restart Redis (if it crashed):

   ```bash
   docker compose restart redis
   ```

3. Verify workers reconnect (ioredis auto-reconnects):

   ```bash
   docker compose logs worker --tail=20 | grep -i "connect"
   ```

4. Check for data loss — compare `queue_waiting_jobs` to pre-outage baseline.

5. If data is lost, check Redis AOF/RDB backups (see [redis-maintenance.md](redis-maintenance.md)).

---

## Workers Not Consuming

**Severity:** P2 — jobs queue up, no processing

### Detect

```promql
# Waiting jobs high, active jobs zero for > 2 min
queue_waiting_jobs > 100 AND jobs_active_current == 0
```

### Respond

1. Check worker container status:

   ```bash
   docker compose ps worker
   docker compose logs worker --tail=50
   ```

2. Look for OOM kills or fatal errors:

   ```bash
   docker inspect <worker_container_id> | grep OOMKilled
   ```

3. Restart workers:

   ```bash
   docker compose restart worker
   ```

4. If workers keep crashing, check for a bad job causing a processor panic:
   - Inspect Bull-Board: `http://localhost:3000/admin/queues` → look for jobs that moved to `failed` immediately
   - Check `jobs_failed_total` counter spike
   - If a single job is crashing the worker process, delete or manually retry it via Bull-Board

5. If the issue is a code bug, roll back the worker image:
   ```bash
   docker compose pull worker
   docker compose up -d worker
   ```

---

## DLQ Spike

**Severity:** P2 — jobs permanently failing

### Detect

```promql
rate(jobs_failed_total[5m]) > 5
queue_failed_jobs{queue="dlq"} > 50
```

### Respond

1. Identify which queue is failing:

   ```bash
   curl http://localhost:3000/metrics | grep jobs_failed_total
   ```

2. Inspect a sample DLQ job for the error message (Bull-Board or API):

   ```bash
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/jobs/dlq/<jobId>
   ```

3. Determine root cause:
   - **Transient upstream failure** (email provider down, external API 429) → wait, then replay
   - **Invalid payload** → fix the producer code, discard bad jobs
   - **Code bug** → roll back the worker, fix, redeploy, replay

4. After fixing, replay affected jobs (see [dlq-recovery.md](dlq-recovery.md)):
   ```bash
   curl -XPOST http://localhost:3000/jobs/dlq/replay \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"limit": 100}'
   ```

---

## API Errors

**Severity:** P2 — clients cannot submit jobs

### Detect

- HTTP 500 responses on `POST /jobs/:queue`
- API container logs show unhandled exceptions

### Respond

1. Check API logs:

   ```bash
   docker compose logs api --tail=100
   ```

2. Check Redis connectivity from the API container:

   ```bash
   docker compose exec api redis-cli -u $REDIS_URL PING
   ```

3. Check for schema/validation issues — confirm the request body is correct:

   ```bash
   curl -v -XPOST http://localhost:3000/jobs/email \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"data":{"to":"test@example.com","subject":"Test","body":"Hi"}}'
   ```

4. Restart the API if necessary:
   ```bash
   docker compose restart api
   ```

---

## Metrics Not Updating

**Severity:** P3 — observability gap

### Detect

- Grafana/Prometheus shows stale data
- `curl http://localhost:3000/metrics` returns unexpected values

### Respond

1. Check Prometheus targets: `http://localhost:9090/targets`

2. Verify the API `/metrics` endpoint is reachable from the Prometheus container:

   ```bash
   docker compose exec prometheus wget -O- http://api:3000/metrics | head -20
   ```

3. Check `queueScraper` is running (it logs at INFO level on start):

   ```bash
   docker compose logs api | grep scraper
   ```

4. Restart the API if the scraper timer appears stuck:
   ```bash
   docker compose restart api
   ```

---

## Auth Failures

**Severity:** P2 if customer-facing; P3 internal

### Detect

- All authenticated endpoints returning `401 Unauthorized`
- JWT verification errors in API logs

### Respond

1. Confirm `JWT_SECRET` env var is set correctly on the API container:

   ```bash
   docker compose exec api printenv JWT_SECRET | wc -c
   # Should be > 32 characters
   ```

2. Check for clock skew between issuer and API (JWT `exp` claims):

   ```bash
   date   # on API host
   # Compare with token issuer's clock
   ```

3. If the secret was rotated, existing tokens are invalid. Issue new tokens via `POST /auth/token`.

4. If it is a clock skew issue, sync NTP:
   ```bash
   timedatectl set-ntp true
   ```

---

## Post-Incident Review

Within 48 hours of any P1/P2 incident:

1. Write a postmortem in `docs/incidents/YYYY-MM-DD-<slug>.md`
2. Answer: What happened? Why? How was it detected? How was it resolved? What would prevent recurrence?
3. Create follow-up tasks for systemic fixes
4. Update this runbook if the symptom/response steps were wrong or missing
