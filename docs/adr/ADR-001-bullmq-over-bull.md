# ADR-001: Use BullMQ Over Bull v3

**Status:** Accepted  
**Date:** 2026-03-12  
**Deciders:** Project team

---

## Context

We needed a Redis-backed job queue library for Node.js. The two main options were:

- **Bull v3** — the original, widely-used library (npm: `bull`)
- **BullMQ v5** — a rewrite of Bull with TypeScript-first design (npm: `bullmq`)

---

## Decision

We chose **BullMQ v5**.

---

## Rationale

| Criterion        | Bull v3                         | BullMQ v5                                |
| ---------------- | ------------------------------- | ---------------------------------------- |
| TypeScript types | Community `@types/bull`         | First-party, bundled                     |
| Maintenance      | Effectively in maintenance mode | Actively developed                       |
| Redis connection | `ioredis` v4 only               | Works with `ioredis` v5                  |
| Job schedulers   | `repeat` option only            | `upsertJobScheduler` (dedicated API)     |
| Flow producers   | Not supported                   | Native parent–child flows                |
| Priority queues  | Supported                       | Supported (improved implementation)      |
| Rate limiting    | Group-level only                | Per-worker, per-queue                    |
| Breaking changes | Stable, no new features         | Occasional API changes (managed via pin) |

BullMQ's first-party TypeScript types eliminate an entire class of `@types/*` drift bugs. The actively maintained codebase means security patches and BullMQ-specific Redis optimisations continue to land. The `upsertJobScheduler` / `removeJobScheduler` API makes cron scheduling a first-class citizen rather than a configuration property on an individual job.

---

## Consequences

- We depend on BullMQ **v5.x** (pinned in `package.json`). Major-version upgrades require an explicit ADR update.
- Bull v3 migration tooling is unnecessary.
- We get `FlowProducer` and sandboxed processors for free should we need them.
- BullMQ requires `maxRetriesPerRequest: null` on the ioredis client — this is set in `src/services/redisClient.ts`.

---

## Alternatives Rejected

- **Agenda** — MongoDB-backed; adds a second datastore dependency.
- **node-resque** — Ruby Resque port; poor TypeScript support.
- **pg-boss** — PostgreSQL-backed; unsuitable when Redis is already present.
