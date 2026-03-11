# adr-005: keep processors as pure functions

**status:** accepted
**date:** 2026-03-12
**deciders:** project team

---

## context

bullmq processors can be written either as:

1. **inline arrow functions** passed directly to `new Worker(name, async (job) => { ... })`
2. **named functions** imported and passed to `createWorker(name, processor)`
3. **sandboxed processors** - a separate file path passed to `new Worker(name, './path/processor.js')` (runs in a child process)

we needed to decide how to structure processor logic for testability, reusability, and separation of concerns.

---

## decision

processors are **pure async functions** exported from dedicated files in `src/processors/`. they accept a `Job` instance and return a `Promise<unknown>`. they **do not import bullmq** beyond the `Job` type.

```typescript
// src/processors/emailProcessor.ts
import type { Job } from 'bullmq';

export async function emailProcessor(job: Job): Promise<{ messageId: string }> {
  const { to, subject, body } = validateEmailJob(job.data);
  // ... send email ...
  return { messageId };
}
```

the worker module passes the function to `createWorker`:

```typescript
// src/workers/emailWorker.ts
import { createWorker } from './workerManager';
import { emailProcessor } from '../processors/emailProcessor';

export const emailWorker = createWorker('email', emailProcessor);
```

---

## rationale

### testability

pure processor functions can be unit-tested with zero bullmq or redis dependencies:

```typescript
it('sends an email', async () => {
  const fakeJob = { data: { to: 'alice@example.com', ... } } as Job;
  const result = await emailProcessor(fakeJob);
  expect(result.messageId).toBeDefined();
});
```

no `new Worker()`, no redis connection, no teardown boilerplate in unit tests.

### separation of concerns

the processor contains **business logic**. the worker contains **bullmq wiring**. changing concurrency, rate limiting, or backoff options does not touch the processor. changing email-sending logic does not touch worker configuration.

### reusability

a processor function can be called directly from scripts, migrations, or tests without starting a worker.

### easier mocking

external dependencies (email client, http client) are passed in or imported within the processor, making them easy to intercept in tests without mocking the entire bullmq `Worker` class.

---

## consequences

- the `BaseProcessor` interface (`src/processors/base.ts`) defines `(job: Job) => Promise<unknown>`.
- all processors must be registered with `createWorker` before the app can consume jobs - processors alone do nothing.
- the sandboxed processor pattern (child process) is not used; processors run in the same process as the worker. if true isolation is needed (e.g., for untrusted code), this adr should be revisited.
- processors should not call `job.updateProgress()` - this is the worker's responsibility via hooks in `workerManager.ts`.

---

## alternatives rejected

- **inline lambdas in the worker constructor**: logic becomes entangled with bullmq wiring, making unit tests impossible without mocking the entire worker.
- **sandboxed processors**: require compiled js file paths, complicating the typescript build. useful for cpu-heavy work that needs true process isolation, but overkill for this project.
- **class-based processors**: unnecessary oop ceremony for what are fundamentally stateless functions.
