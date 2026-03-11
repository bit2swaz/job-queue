# adr-001: use bullmq over bull v3

**status:** accepted
**date:** 2026-03-12
**deciders:** project team

---

## context

we needed a redis-backed job queue library for node.js. the two main options were:

- **bull v3** - the original, widely-used library (npm: `bull`)
- **bullmq v5** - a rewrite of bull with typescript-first design (npm: `bullmq`)

---

## decision

we chose **bullmq v5**.

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

## consequences

- we depend on bullmq **v5.x** (pinned in `package.json`). major-version upgrades require an explicit adr update.
- bull v3 migration tooling is unnecessary.
- we get `FlowProducer` and sandboxed processors for free should we need them.
- bullmq requires `maxRetriesPerRequest: null` on the ioredis client - this is set in `src/services/redisClient.ts`.

---

## alternatives rejected

- **agenda** - mongodb-backed; adds a second datastore dependency.
- **node-resque** - ruby resque port; poor typescript support.
- **pg-boss** - postgresql-backed; unsuitable when redis is already present.
