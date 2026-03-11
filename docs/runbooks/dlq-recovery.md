# Runbook: Dead-Letter Queue (DLQ) Recovery

**Audience:** SRE / On-call engineer  
**Last updated:** 2026-03-12  
**Related:** `src/services/deadLetterService.ts`

---

## Overview

Jobs that exhaust all retry attempts are automatically routed to the `dlq` queue by the `failed` event handler in `src/services/deadLetterService.ts`. This runbook covers inspecting, replaying, and purging DLQ jobs.

---

## DLQ structure

| Field               | Source                                |
| ------------------- | ------------------------------------- |
| `name`              | Original queue name (e.g., `email`)   |
| `data`              | Original job payload (unchanged)      |
| `opts.failedReason` | Last error message from the processor |
| `opts.stacktrace`   | Stack trace of the last failure       |
| `timestamp`         | When the job was first added          |
| `processedOn`       | When the last attempt ran             |

---

## Inspect DLQ jobs

### Via Bull-Board UI

Navigate to `http://localhost:3000/admin/queues` → `dlq` queue.  
Each job shows the failure reason and stack trace.

### Via REST API

```bash
TOKEN=$(curl -s -XPOST http://localhost:3000/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"sub":"ops","role":"admin"}' | jq -r .token)

# Get a DLQ job by ID
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/jobs/dlq/<jobId>
```

### Via Prometheus

```promql
# Current DLQ depth
queue_failed_jobs{queue="dlq"}

# Rate of jobs entering DLQ
rate(jobs_failed_total[5m])
```

---

## Replay DLQ jobs

Replaying re-adds jobs to their original queue so they will be processed again.

### Via REST API (preferred)

```bash
# Replay up to 50 DLQ jobs
curl -XPOST http://localhost:3000/jobs/dlq/replay \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"limit": 50}'
```

### Via `deadLetterService` (script)

```typescript
import { replayDLQJobs } from './src/services/deadLetterService';
const results = await replayDLQJobs(50);
console.log(`Replayed ${results.replayed} jobs, ${results.failed} errors`);
```

---

## When to replay vs. discard

| Scenario                           | Action                             |
| ---------------------------------- | ---------------------------------- |
| Transient external service outage  | Replay after the service recovers  |
| Invalid payload (validation error) | Fix the producer, discard job      |
| Code bug fixed in new deploy       | Replay after rolling out the fix   |
| Permanent downstream failure       | Discard + alert the business owner |

---

## Purge DLQ

⚠️ **Irreversible.** Only purge after confirming jobs are safe to discard.

```bash
# Via Bull-Board UI: select jobs → Delete
# Or via Redis CLI:
redis-cli
> LRANGE bull:dlq:wait 0 -1    # inspect job IDs
> DEL bull:dlq:wait             # purge waiting list
```

Alternatively, use BullMQ's `drain()`:

```typescript
import { dlq } from './src/queues/queues';
await dlq.drain(); // removes all waiting jobs (not active)
await dlq.clean(0, 1000, 'failed'); // remove up to 1000 failed jobs older than 0ms
```

---

## Alerts

The `alertService.ts` is called when a job is routed to the DLQ. To connect real alerting:

1. Edit `src/services/alertService.ts`
2. Implement `sendAlert(job, error)` to call PagerDuty / Slack / OpsGenie
3. Redeploy workers

---

## Post-incident

After resolving the root cause:

1. Replay affected DLQ jobs
2. Monitor `queue_waiting_jobs` and `jobs_completed_total` to confirm throughput recovers
3. File a postmortem referencing the incident runbook: [`incident-response.md`](incident-response.md)
