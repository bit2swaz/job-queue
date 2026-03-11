# contributing to job queue

thank you for contributing! this document explains how to get the project running locally, the conventions we follow, and the checklist for opening a pull request.

---

## table of contents

- [local development setup](#local-development-setup)
- [branch naming](#branch-naming)
- [commit format](#commit-format)
- [pull request checklist](#pull-request-checklist)
- [adding a new queue](#adding-a-new-queue)
- [adding a new processor](#adding-a-new-processor)
- [testing philosophy](#testing-philosophy)
- [code style](#code-style)

---

## local development setup

```bash
# 1. fork + clone
git clone https://github.com/<your-fork>/job-queue.git
cd job-queue

# 2. install dependencies
npm install

# 3. start redis (docker)
docker compose -f docker/docker-compose.test.yml up -d

# 4. copy environment variables
cp .env.example .env
# set JWT_SECRET=dev-secret-at-least-32-chars

# 5. run tests (to confirm everything passes)
npm test

# 6. start api dev server
npm run dev

# 7. start worker dev process
npm run start:worker
```

---

## branch naming

| category     | pattern                    | example                          |
| ------------ | -------------------------- | -------------------------------- |
| feature      | `feat/<short-description>` | `feat/rate-limit-per-queue`      |
| bug fix      | `fix/<short-description>`  | `fix/dlq-replay-duplicate-id`    |
| chore / deps | `chore/<description>`      | `chore/bump-bullmq-5.71`         |
| docs         | `docs/<description>`       | `docs/update-runbook-scaling`    |
| refactor     | `refactor/<description>`   | `refactor/extract-queue-factory` |
| test         | `test/<description>`       | `test/add-priority-edge-cases`   |

---

## commit format

we follow [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/).

```
<type>(<scope>): <short imperative summary>

[optional body — wrap at 72 chars]

[optional footer: BREAKING CHANGE, Closes #123]
```

**types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`

**scope examples:** `queue`, `worker`, `api`, `metrics`, `dlq`, `auth`, `docker`, `deps`

**examples:**

```
feat(queue): add per-queue rate limiter support

fix(worker): prevent duplicate active gauge on worker restart

docs(runbook): add Redis FLUSHALL warning to maintenance guide

test(scheduling): cover timezone-aware cron edge case
```

---

## pull request checklist

before opening a pr, ensure:

- [ ] all tests pass locally: `npm test`
- [ ] no typescript errors: `npm run build`
- [ ] lint passes: `npm run lint`
- [ ] new code has unit **and** integration tests (RED -> GREEN -> REFACTOR)
- [ ] new public functions have JSDoc (`@param`, `@returns`, `@throws`)
- [ ] `CHANGELOG.md` updated with an `[Unreleased]` entry
- [ ] pr title follows conventional commits format
- [ ] no `console.log` - use the `logger` (`src/utils/logger.ts`)
- [ ] no `any` types - use proper generics or `unknown`
- [ ] environment variables documented in `README.md` table and `.env.example`

---

## adding a new queue

1. **add the queue name** to `src/queues/queues.ts`:

```typescript
export const newQueue = getQueue('new-queue-name');
```

2. **export it** from `src/queues/queueManager.ts` (add to the `getAllQueues()` registry array).

3. **create a processor** at `src/processors/newQueueProcessor.ts` (see [adding a new processor](#adding-a-new-processor)).

4. **create a worker** at `src/workers/newQueueWorker.ts`:

```typescript
import { createWorker } from './workerManager';
import { newQueueProcessor } from '../processors/newQueueProcessor';

export const newQueueWorker = createWorker('new-queue-name', newQueueProcessor);
```

5. **register the worker** in `src/worker.ts`:

```typescript
import './workers/newQueueWorker';
```

6. **register the board adapter** in `src/dashboard/board.ts`:

```typescript
import { newQueue } from '../queues/queues';
// add to adapters array:
new BullMQAdapter(newQueue),
```

7. **write tests** - at minimum:
   - unit test for the processor in `tests/unit/processors/newQueueProcessor.test.ts`
   - integration test that submits a job to the new queue

8. **update the README** table of known queues.

---

## adding a new processor

processors must conform to the `BaseProcessor` interface and contain **no bullmq imports**:

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

rules:

- **no side effects** at import time (no `new Queue()` calls, no `setInterval`)
- **no `console.log`** - use `logger.info / .warn / .error`
- use named exports (not default)
- handle expected errors and re-throw unexpected ones so bullmq can apply backoff

---

## testing philosophy

we follow **strict tdd**:

1. **red**: write a failing test that describes the desired behaviour
2. **green**: write the minimum code to make it pass
3. **refactor**: clean up duplication, improve names, add JSDoc

test structure:

- `tests/unit/` - pure logic, no redis, no network. run with `npm run test:unit`
- `tests/integration/` - require a real redis. run with `npm run test:integration`
- `tests/smoke/` - full docker stack. run with `RUN_CONTAINER_SMOKE=1 npm test`

a few ground rules:

- never mock `ioredis` at the module level - use real redis in integration tests
- tear down queues and workers in `afterAll` / `afterEach` to avoid resource leaks
- set realistic timeouts: 30 s for integration suites, 5 s for unit tests
- do not use `done` callbacks - use `async/await` throughout

---

## code style

- **typescript strict mode** - `strict: true`, `noUncheckedIndexedAccess: true`
- **no `any`** - prefer `unknown` + type narrowing or precise generics
- **no `console.*`** - import `logger` from `../utils/logger`
- imports sorted: stdlib -> third-party -> local (eslint-plugin-import order rule)
- max line length: 100 characters
- semicolons: required
- quotes: single (`'`)
