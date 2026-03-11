# ADR-003: Run the API Server and Workers as Separate Processes

**Status:** Accepted  
**Date:** 2026-03-12  
**Deciders:** Project team

---

## Context

BullMQ jobs can be enqueued from a web process and consumed by workers in the same Node.js process or in separate processes. We had to decide which topology to use for this system.

---

## Decision

The **API server** (`src/index.ts`) and **workers** (`src/worker.ts`) are separate Node.js entry points, intended to be run as separate OS processes (or separate containers in Docker Compose).

---

## Rationale

### Independent scaling

The API receives HTTP traffic; workers consume jobs from Redis. These workloads have different resource profiles:

- API: I/O-bound, needs low latency, scales with request rate
- Workers: CPU/memory-bound (report generation, image processing), scales with queue depth

Running them together forces the same scaling policy on both, wasting resources.

### Fault isolation

A worker crash (unhandled exception in a processor) cannot take down the API. The API continues to accept new job submissions while the worker is restarting.

### Graceful shutdown

Workers call `worker.close()` on `SIGTERM`, which drains in-flight jobs before exiting. The API can restart independently for deploys without interrupting long-running jobs.

### Docker Compose topology

```
api     → single container, EXPOSE 3000, scales with HTTP load
worker  → deploy.replicas: 3, scales with queue depth
redis   → single container (or Redis Cluster for production scale)
```

Workers can be scaled independently: `docker compose up --scale worker=10`.

---

## Consequences

- `src/index.ts` starts only the Express server; no `createWorker` calls.
- `src/worker.ts` imports all worker modules; no `app.listen` call.
- Shared code (queue manager, processors, config) is imported in both entry points but executes in separate memory spaces.
- In development, two terminal tabs (or `npm run dev` + `npm run start:worker`) are required.
- In production Docker Compose, `api` and `worker` are separate services.
- The integration test suite starts the API via `supertest` (in-process); workers are started and closed by each test that needs them.

---

## Alternatives Rejected

- **Monolith (API + workers in one process)**: Simple to start but cannot scale API and workers independently. A crashed processor crashes the web server.
- **Serverless functions for workers**: No persistent Redis connection; incompatible with BullMQ's blocking pop model. Unsuitable for long-running jobs.
