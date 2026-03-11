# runbook: dead-letter queue (dlq) recovery

**audience:** sre / on-call engineer
**last updated:** 2026-03-12
**related:** `src/services/deadLetterService.ts`

---

## overview

jobs that exhaust all retry attempts are automatically routed to the `dlq` queue by the `failed` event handler in `src/services/deadLetterService.ts`. this runbook covers inspecting, replaying, and purging dlq jobs.

---

## dlq structure

| field               | source                                |
| ------------------- | ------------------------------------- |
| `name`              | original queue name (e.g., `email`)   |
| `data`              | original job payload (unchanged)      |
| `opts.failedReason` | last error message from the processor |
| `opts.stacktrace`   | stack trace of the last failure       |
| `timestamp`         | when the job was first added          |
| `processedOn`       | when the last attempt ran             |

---

## inspect dlq jobs

### via bull-board ui

navigate to `http://localhost:3000/admin/queues` -> `dlq` queue.
each job shows the failure reason and stack trace.

### via rest api

```bash
TOKEN=$(curl -s -XPOST http://localhost:3000/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"sub":"ops","role":"admin"}' | jq -r .token)

# get a dlq job by id
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/jobs/dlq/<jobId>
```

### via prometheus

```promql
# current dlq depth
queue_failed_jobs{queue="dlq"}

# rate of jobs entering dlq
rate(jobs_failed_total[5m])
```

---

## replay dlq jobs

replaying re-adds jobs to their original queue so they will be processed again.

### via rest api (preferred)

```bash
# replay up to 50 dlq jobs
curl -XPOST http://localhost:3000/jobs/dlq/replay \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"limit": 50}'
```

### via `deadLetterService` (script)

```typescript
import { replayDLQJobs } from './src/services/deadLetterService';
const results = await replayDLQJobs(50);
console.log(`Replayed ${results.replayed} jobs, ${results.failed} errors`);
```

---

## when to replay vs. discard

| scenario                           | action                             |
| ---------------------------------- | ---------------------------------- |
| transient external service outage  | replay after the service recovers  |
| invalid payload (validation error) | fix the producer, discard job      |
| code bug fixed in new deploy       | replay after rolling out the fix   |
| permanent downstream failure       | discard + alert the business owner |

---

## purge dlq

**irreversible.** only purge after confirming jobs are safe to discard.

```bash
# via bull-board ui: select jobs -> delete
# or via redis cli:
redis-cli
> LRANGE bull:dlq:wait 0 -1    # inspect job IDs
> DEL bull:dlq:wait             # purge waiting list
```

alternatively, use bullmq's `drain()`:

```typescript
import { dlq } from './src/queues/queues';
await dlq.drain(); // removes all waiting jobs (not active)
await dlq.clean(0, 1000, 'failed'); // remove up to 1000 failed jobs older than 0ms
```

---

## alerts

the `alertService.ts` is called when a job is routed to the dlq. to connect real alerting:

1. edit `src/services/alertService.ts`
2. implement `sendAlert(job, error)` to call pagerduty / slack / opsgenie
3. redeploy workers

---

## post-incident

after resolving the root cause:

1. replay affected dlq jobs
2. monitor `queue_waiting_jobs` and `jobs_completed_total` to confirm throughput recovers
3. file a postmortem referencing the incident runbook: [`incident-response.md`](incident-response.md)
