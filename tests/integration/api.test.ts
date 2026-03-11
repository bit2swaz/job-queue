/**
 * Integration tests for the REST API — Phase 6
 *
 * Requires a live Redis instance (localhost:6379 or REDIS_URL env var).
 * Starts a real Worker for the email queue so jobs actually complete.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { Worker } from 'bullmq';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'api-integration-test-secret';
process.env['JWT_SECRET'] = TEST_SECRET;
process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

function bearerToken(): string {
  return `Bearer ${jwt.sign({ sub: 'integration-test', role: 'admin' }, TEST_SECRET, { expiresIn: '1h' })}`;
}

/** Poll until job is in a terminal state (completed/failed/unknown) */
async function pollJobState(
  server: Express,
  queue: string,
  jobId: string,
  maxMs = 10_000,
): Promise<{ state: string; result: unknown }> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await request(server)
      .get(`/jobs/${queue}/${jobId}`)
      .set('Authorization', bearerToken());
    if (res.status === 200 && ['completed', 'failed'].includes(res.body.state as string)) {
      return res.body as { state: string; result: unknown };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`job ${jobId} did not reach terminal state within ${maxMs}ms`);
}

// ── suite ────────────────────────────────────────────────────────────────────

describe('REST API — integration', () => {
  let app: Express;
  let worker: Worker;

  beforeAll(async () => {
    const { createApp } = await import('../../src/app');
    const { createWorker } = await import('@workers/workerManager');
    app = createApp();
    worker = createWorker('email');
  });

  afterAll(async () => {
    await worker.close();
    const { closeAllQueues } = await import('@queues/queueManager');
    const { getRedisClient } = await import('@services/redisClient');
    await closeAllQueues();
    await getRedisClient().quit();
  });

  // ── health endpoint ────────────────────────────────────────────────────────

  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', redis: 'ok' });
  });

  // ── auth ───────────────────────────────────────────────────────────────────

  it('POST /jobs/email without JWT returns 401', async () => {
    const res = await request(app)
      .post('/jobs/email')
      .send({ data: { to: 'test@example.com', subject: 'S', body: 'B' } });
    expect(res.status).toBe(401);
  });

  // ── job submission + lifecycle ─────────────────────────────────────────────

  it('full email job lifecycle: submit → 202 → COMPLETED', async () => {
    // 1. submit
    const submitRes = await request(app)
      .post('/jobs/email')
      .set('Authorization', bearerToken())
      .send({ data: { to: 'user@example.com', subject: 'Hello', body: 'World' } });

    expect(submitRes.status).toBe(202);
    const { jobId, queue, status } = submitRes.body as {
      jobId: string;
      queue: string;
      status: string;
    };
    expect(typeof jobId).toBe('string');
    expect(queue).toBe('email');
    expect(status).toBe('queued');

    // 2. poll until terminal
    const terminal = await pollJobState(app, 'email', jobId);
    expect(terminal.state).toBe('completed');
  }, 15_000);

  it('GET /jobs/:queue/:id returns 404 for unknown job', async () => {
    const res = await request(app)
      .get('/jobs/email/nonexistent-job-id-xyz')
      .set('Authorization', bearerToken());
    expect(res.status).toBe(404);
  });

  it('POST /jobs/unknown-queue returns 400', async () => {
    const res = await request(app)
      .post('/jobs/unknown-queue')
      .set('Authorization', bearerToken())
      .send({ data: { foo: 'bar' } });
    expect(res.status).toBe(400);
  });

  it('POST /jobs/email with missing data returns 422', async () => {
    const res = await request(app)
      .post('/jobs/email')
      .set('Authorization', bearerToken())
      .send({ opts: { priority: 1 } });
    expect(res.status).toBe(422);
  });

  // ── deduplication (idempotencyKey) — Phase 7.5 ────────────────────────────

  it('submitting the same idempotencyKey twice returns the same jobId', async () => {
    const key = `dedup-test-${Date.now()}`;

    const first = await request(app)
      .post('/jobs/email')
      .set('Authorization', bearerToken())
      .send({
        data: { to: 'dup@example.com', subject: 'Dup', body: 'test' },
        idempotencyKey: key,
      });
    expect(first.status).toBe(202);
    const firstJobId = (first.body as { jobId: string }).jobId;
    expect(firstJobId).toBe(key);

    // Second submission with the same key must NOT create a new job.
    const second = await request(app)
      .post('/jobs/email')
      .set('Authorization', bearerToken())
      .send({
        data: { to: 'dup2@example.com', subject: 'Dup2', body: 'test2' },
        idempotencyKey: key,
      });
    expect(second.status).toBe(202);
    const secondJobId = (second.body as { jobId: string }).jobId;

    // BullMQ de-duplicates by jobId: same key → same job returned.
    expect(secondJobId).toBe(firstJobId);
  }, 15_000);
});
