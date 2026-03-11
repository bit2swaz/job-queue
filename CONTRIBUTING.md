# Contributing to Job Queue

Thank you for contributing! This document explains how to get the project running locally, the conventions we follow, and the checklist for opening a pull request.

---

## Table of Contents

- [Local Development Setup](#local-development-setup)
- [Branch Naming](#branch-naming)
- [Commit Format](#commit-format)
- [Pull Request Checklist](#pull-request-checklist)
- [Adding a New Queue](#adding-a-new-queue)
- [Adding a New Processor](#adding-a-new-processor)
- [Testing Philosophy](#testing-philosophy)
- [Code Style](#code-style)

---

## Local Development Setup

```bash
# 1. Fork + clone
git clone https://github.com/<your-fork>/job-queue.git
cd job-queue

# 2. Install dependencies
npm install

# 3. Start Redis (Docker)
docker compose -f docker/docker-compose.test.yml up -d

# 4. Copy environment variables
cp .env.example .env
# Set JWT_SECRET=dev-secret-at-least-32-chars

# 5. Run tests (to confirm everything passes)
npm test

# 6. Start API dev server
npm run dev

# 7. Start worker dev process
npm run start:worker
```

---

## Branch Naming

| Category     | Pattern                    | Example                          |
| ------------ | -------------------------- | -------------------------------- |
| Feature      | `feat/<short-description>` | `feat/rate-limit-per-queue`      |
| Bug fix      | `fix/<short-description>`  | `fix/dlq-replay-duplicate-id`    |
| Chore / deps | `chore/<description>`      | `chore/bump-bullmq-5.71`         |
| Docs         | `docs/<description>`       | `docs/update-runbook-scaling`    |
| Refactor     | `refactor/<description>`   | `refactor/extract-queue-factory` |
| Test         | `test/<description>`       | `test/add-priority-edge-cases`   |

---

## Commit Format

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

```
<type>(<scope>): <short imperative summary>

[optional body — wrap at 72 chars]

[optional footer: BREAKING CHANGE, Closes #123]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`

**Scope examples:** `queue`, `worker`, `api`, `metrics`, `dlq`, `auth`, `docker`, `deps`

**Examples:**

```
feat(queue): add per-queue rate limiter support

fix(worker): prevent duplicate active gauge on worker restart

docs(runbook): add Redis FLUSHALL warning to maintenance guide

test(scheduling): cover timezone-aware cron edge case
```

---

## Pull Request Checklist

Before opening a PR, ensure:

- [ ] All tests pass locally: `npm test`
- [ ] No TypeScript errors: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] New code has unit **and** integration tests (RED → GREEN → REFACTOR)
- [ ] New public functions have JSDoc (`@param`, `@returns`, `@throws`)
- [ ] `CHANGELOG.md` updated with an `[Unreleased]` entry
- [ ] PR title follows Conventional Commits format
- [ ] No `console.log` — use the `logger` (`src/utils/logger.ts`)
- [ ] No `any` types — use proper generics or `unknown`
- [ ] Environment variables documented in `README.md` table and `.env.example`

---

## Adding a New Queue

1. **Add the queue name** to `src/queues/queues.ts`:

```typescript
export const newQueue = getQueue('new-queue-name');
```

2. **Export it** from `src/queues/queueManager.ts` (add to the `getAllQueues()` registry array).

3. **Create a processor** at `src/processors/newQueueProcessor.ts` (see [Adding a New Processor](#adding-a-new-processor)).

4. **Create a worker** at `src/workers/newQueueWorker.ts`:

```typescript
import { createWorker } from './workerManager';
import { newQueueProcessor } from '../processors/newQueueProcessor';

export const newQueueWorker = createWorker('new-queue-name', newQueueProcessor);
```

5. **Register the worker** in `src/worker.ts`:

```typescript
import './workers/newQueueWorker';
```

6. **Register the board adapter** in `src/dashboard/board.ts`:

```typescript
import { newQueue } from '../queues/queues';
// Add to adapters array:
new BullMQAdapter(newQueue),
```

7. **Write tests** — at minimum:
   - Unit test for the processor in `tests/unit/processors/newQueueProcessor.test.ts`
   - Integration test that submits a job to the new queue

8. **Update the README** table of known queues.

---

## Adding a New Processor

Processors must conform to the `BaseProcessor` interface and contain **no BullMQ imports**:

```typescript
// src/processors/myProcessor.ts
import type { Job } from 'bullmq';
import { logger } from '../utils/logger';

/**
 * Process a my-queue job.
 * @param job - The BullMQ job instance
 * @returns Resolved promise with the processing result
 * @throws {Error} If processing fails (triggers retry/DLQ routing)
 */
export async function myProcessor(job: Job): Promise<unknown> {
  logger.info({ jobId: job.id }, 'Processing my job');
  // ... pure business logic ...
  return { status: 'done' };
}
```

Rules:

- **No side effects** at import time (no `new Queue()` calls, no `setInterval`)
- **No `console.log`** — use `logger.info / .warn / .error`
- Use named exports (not default)
- Handle expected errors and re-throw unexpected ones so BullMQ can apply backoff

---

## Testing Philosophy

We follow **strict TDD**:

1. **RED**: Write a failing test that describes the desired behaviour
2. **GREEN**: Write the minimum code to make it pass
3. **REFACTOR**: Clean up duplication, improve names, add JSDoc

Test structure:

- `tests/unit/` — pure logic, no Redis, no network. Run with `npm run test:unit`
- `tests/integration/` — require a real Redis. Run with `npm run test:integration`
- `tests/smoke/` — full Docker stack. Run with `RUN_CONTAINER_SMOKE=1 npm test`

A few ground rules:

- Never mock `ioredis` at the module level — use real Redis in integration tests
- Tear down queues and workers in `afterAll` / `afterEach` to avoid resource leaks
- Set realistic timeouts: 30 s for integration suites, 5 s for unit tests
- Do not use `done` callbacks — use `async/await` throughout

---

## Code Style

- **TypeScript strict mode** — `strict: true`, `noUncheckedIndexedAccess: true`
- **No `any`** — prefer `unknown` + type narrowing or precise generics
- **No `console.*`** — import `logger` from `../utils/logger`
- Imports sorted: stdlib → third-party → local (eslint-plugin-import order rule)
- Max line length: 100 characters
- Semicolons: required
- Quotes: single (`'`)
