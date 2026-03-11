# runbook: incident response

**audience:** on-call engineer
**last updated:** 2026-03-12
**severity levels:** p1 (critical) - p2 (major) - p3 (minor)

---

## quick-reference: symptom -> action

| symptom                                  | likely cause                      | runbook section                                 |
| ---------------------------------------- | --------------------------------- | ----------------------------------------------- |
| `GET /health` returns non-200            | redis down                        | [redis outage](#redis-outage)                   |
| queue depth rising, no workers consuming | workers crashed                   | [workers not consuming](#workers-not-consuming) |
| dlq depth growing rapidly                | processor bug or upstream failure | [dlq spike](#dlq-spike)                         |
| api returns 500 on job submission        | bullmq enqueue error              | [api errors](#api-errors)                       |
| `/metrics` returns stale data            | prometheus scrape failing         | [metrics not updating](#metrics-not-updating)   |
| jwt errors on all requests               | secret rotated / clock skew       | [auth failures](#auth-failures)                 |

---

## redis outage

**severity:** p1 - blocks all job submission and consumption

### detect

```bash
# health endpoint
curl http://localhost:3000/health

# direct ping
redis-cli -u $REDIS_URL PING
```

### respond

1. check redis container/process status:

   ```bash
   docker compose ps redis
   docker compose logs redis --tail=50
   ```

2. restart redis (if it crashed):

   ```bash
   docker compose restart redis
   ```

3. verify workers reconnect (ioredis auto-reconnects):

   ```bash
   docker compose logs worker --tail=20 | grep -i "connect"
   ```

4. check for data loss - compare `queue_waiting_jobs` to pre-outage baseline.

5. if data is lost, check redis aof/rdb backups (see [redis-maintenance.md](redis-maintenance.md)).

---

## workers not consuming

**severity:** p2 - jobs queue up, no processing

### detect

```promql
# waiting jobs high, active jobs zero for > 2 min
queue_waiting_jobs > 100 AND jobs_active_current == 0
```

### respond

1. check worker container status:

   ```bash
   docker compose ps worker
   docker compose logs worker --tail=50
   ```

2. look for oom kills or fatal errors:

   ```bash
   docker inspect <worker_container_id> | grep OOMKilled
   ```

3. restart workers:

   ```bash
   docker compose restart worker
   ```

4. if workers keep crashing, check for a bad job causing a processor panic:
   - inspect bull-board: `http://localhost:3000/admin/queues` -> look for jobs that moved to `failed` immediately
   - check `jobs_failed_total` counter spike
   - if a single job is crashing the worker process, delete or manually retry it via bull-board

5. if the issue is a code bug, roll back the worker image:
   ```bash
   docker compose pull worker
   docker compose up -d worker
   ```

---

## dlq spike

**severity:** p2 - jobs permanently failing

### detect

```promql
rate(jobs_failed_total[5m]) > 5
queue_failed_jobs{queue="dlq"} > 50
```

### respond

1. identify which queue is failing:

   ```bash
   curl http://localhost:3000/metrics | grep jobs_failed_total
   ```

2. inspect a sample dlq job for the error message (bull-board or api):

   ```bash
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/jobs/dlq/<jobId>
   ```

3. determine root cause:
   - **transient upstream failure** (email provider down, external api 429) -> wait, then replay
   - **invalid payload** -> fix the producer code, discard bad jobs
   - **code bug** -> roll back the worker, fix, redeploy, replay

4. after fixing, replay affected jobs (see [dlq-recovery.md](dlq-recovery.md)):
   ```bash
   curl -XPOST http://localhost:3000/jobs/dlq/replay \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"limit": 100}'
   ```

---

## api errors

**severity:** p2 - clients cannot submit jobs

### detect

- http 500 responses on `POST /jobs/:queue`
- api container logs show unhandled exceptions

### respond

1. check api logs:

   ```bash
   docker compose logs api --tail=100
   ```

2. check redis connectivity from the api container:

   ```bash
   docker compose exec api redis-cli -u $REDIS_URL PING
   ```

3. check for schema/validation issues - confirm the request body is correct:

   ```bash
   curl -v -XPOST http://localhost:3000/jobs/email \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"data":{"to":"test@example.com","subject":"Test","body":"Hi"}}'
   ```

4. restart the api if necessary:
   ```bash
   docker compose restart api
   ```

---

## metrics not updating

**severity:** p3 - observability gap

### detect

- grafana/prometheus shows stale data
- `curl http://localhost:3000/metrics` returns unexpected values

### respond

1. check prometheus targets: `http://localhost:9090/targets`

2. verify the api `/metrics` endpoint is reachable from the prometheus container:

   ```bash
   docker compose exec prometheus wget -O- http://api:3000/metrics | head -20
   ```

3. check `queueScraper` is running (it logs at info level on start):

   ```bash
   docker compose logs api | grep scraper
   ```

4. restart the api if the scraper timer appears stuck:
   ```bash
   docker compose restart api
   ```

---

## auth failures

**severity:** p2 if customer-facing; p3 internal

### detect

- all authenticated endpoints returning `401 Unauthorized`
- jwt verification errors in api logs

### respond

1. confirm `JWT_SECRET` env var is set correctly on the api container:

   ```bash
   docker compose exec api printenv JWT_SECRET | wc -c
   # should be > 32 characters
   ```

2. check for clock skew between issuer and api (jwt `exp` claims):

   ```bash
   date   # on api host
   # compare with token issuer's clock
   ```

3. if the secret was rotated, existing tokens are invalid. issue new tokens via `POST /auth/token`.

4. if it is a clock skew issue, sync ntp:
   ```bash
   timedatectl set-ntp true
   ```

---

## post-incident review

within 48 hours of any p1/p2 incident:

1. write a postmortem in `docs/incidents/YYYY-MM-DD-<slug>.md`
2. answer: what happened? why? how was it detected? how was it resolved? what would prevent recurrence?
3. create follow-up tasks for systemic fixes
4. update this runbook if the symptom/response steps were wrong or missing
