# ADR-005: Keep Processors as Pure Functions

**Status:** Accepted  
**Date:** 2026-03-12  
**Deciders:** Project team

---

## Context

BullMQ processors can be written either as:

1. **Inline arrow functions** passed directly to `new Worker(name, async (job) => { ... })`
2. **Named functions** imported and passed to `createWorker(name, processor)`
3. **Sandboxed processors** — a separate file path passed to `new Worker(name, './path/processor.js')` (runs in a child process)

We needed to decide how to structure processor logic for testability, reusability, and separation of concerns.

---

## Decision

Processors are **pure async functions** exported from dedicated files in `src/processors/`. They accept a `Job` instance and return a `Promise<unknown>`. They **do not import BullMQ** beyond the `Job` type.

```typescript
// src/processors/emailProcessor.ts
import type { Job } from 'bullmq';

export async function emailProcessor(job: Job): Promise<{ messageId: string }> {
  const { to, subject, body } = validateEmailJob(job.data);
  // ... send email ...
  return { messageId };
}
```

The worker module passes the function to `createWorker`:

```typescript
// src/workers/emailWorker.ts
import { createWorker } from './workerManager';
import { emailProcessor } from '../processors/emailProcessor';

export const emailWorker = createWorker('email', emailProcessor);
```

---

## Rationale

### Testability

Pure processor functions can be unit-tested with zero BullMQ or Redis dependencies:

```typescript
it('sends an email', async () => {
  const fakeJob = { data: { to: 'alice@example.com', ... } } as Job;
  const result = await emailProcessor(fakeJob);
  expect(result.messageId).toBeDefined();
});
```

No `new Worker()`, no Redis connection, no teardown boilerplate in unit tests.

### Separation of concerns

The processor contains **business logic**. The worker contains **BullMQ wiring**. Changing concurrency, rate limiting, or backoff options does not touch the processor. Changing email-sending logic does not touch worker configuration.

### Reusability

A processor function can be called directly from scripts, migrations, or tests without starting a worker.

### Easier mocking

External dependencies (email client, HTTP client) are passed in or imported within the processor, making them easy to intercept in tests without mocking the entire BullMQ `Worker` class.

---

## Consequences

- The `BaseProcessor` interface (`src/processors/base.ts`) defines `(job: Job) => Promise<unknown>`.
- All processors must be registered with `createWorker` before the app can consume jobs — processors alone do nothing.
- The sandboxed processor pattern (child process) is not used; processors run in the same process as the worker. If true isolation is needed (e.g., for untrusted code), this ADR should be revisited.
- Processors should not call `job.updateProgress()` — this is the worker's responsibility via hooks in `workerManager.ts`.

---

## Alternatives Rejected

- **Inline lambdas in the Worker constructor**: Logic becomes entangled with BullMQ wiring, making unit tests impossible without mocking the entire Worker.
- **Sandboxed processors**: Require compiled JS file paths, complicating the TypeScript build. Useful for CPU-heavy work that needs true process isolation, but overkill for this project.
- **Class-based processors**: Unnecessary OOP ceremony for what are fundamentally stateless functions.
