/**
 * Integration tests for Phase 8 — Prometheus /metrics endpoint.
 *
 * Requires a live Redis instance on localhost:6379 (or REDIS_URL env var).
 *
 * 1. Completes 3 email jobs via the API.
 * 2. Attaches metrics hooks to the worker via attachMetrics().
 * 3. Hits GET /metrics and parses the Prometheus text format.
 * 4. Asserts: correct Content-Type, key counters present, default Node.js
 *    process metrics present (process_cpu_seconds_total etc.).
 */

import request from 'supertest';
import type { Express } from 'express';
import type { Worker } from 'bullmq';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'metrics-integration-test-secret';
process.env['JWT_SECRET'] = TEST_SECRET;
process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

function bearerToken(): string {
  return `Bearer ${jwt.sign({ sub: 'metrics-test', role: 'admin' }, TEST_SECRET, {
    expiresIn: '1h',
  })}`;
}

/** Poll until job is in a terminal state */
async function pollJobState(
  app: Express,
  queue: string,
  jobId: string,
  maxMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await request(app)
      .get(`/jobs/${queue}/${jobId}`)
      .set('Authorization', bearerToken());
    if (res.status === 200 && ['completed', 'failed'].includes(res.body.state as string)) {
      return res.body.state as string;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`job ${jobId} did not complete within ${maxMs}ms`);
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('metrics integration: /metrics endpoint', () => {
  let app: Express;
  let worker: Worker;

  beforeAll(async () => {
    const { createApp } = await import('../../src/app');
    const { createWorker } = await import('@workers/workerManager');
    const { attachMetrics } = await import('../../src/observability/workerMetrics');

    app = createApp();
    worker = createWorker('email');
    attachMetrics(worker);

    // Complete 3 jobs so we have meaningful counter values.
    for (let i = 0; i < 3; i++) {
      const submitRes = await request(app)
        .post('/jobs/email')
        .set('Authorization', bearerToken())
        .send({ data: { to: `u${i}@example.com`, subject: 'S', body: 'B' } });

      expect(submitRes.status).toBe(202);
      const { jobId } = submitRes.body as { jobId: string };
      await pollJobState(app, 'email', jobId);
    }
  }, 30_000);

  afterAll(async () => {
    await worker.close();
    const { closeAllQueues } = await import('@queues/queueManager');
    const { getRedisClient } = await import('@services/redisClient');
    await closeAllQueues();
    await getRedisClient().quit();
  });

  it('GET /metrics returns 200 with Prometheus Content-Type', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('/metrics response contains jobs_completed_total for email queue', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/jobs_completed_total\{.*queue="email".*\}/);
  });

  it('/metrics response shows jobs_completed_total >= 3 for email', async () => {
    const res = await request(app).get('/metrics');
    // Parse the line: jobs_completed_total{queue="email"} <value>
    const match = res.text.match(/jobs_completed_total\{[^}]*queue="email"[^}]*\}\s+(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(3);
  });

  it('/metrics response contains job_duration_seconds histogram', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/job_duration_seconds/);
  });

  it('/metrics response contains default Node.js process metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/process_cpu_seconds_total/);
  });

  it('/metrics response contains all 5 custom metric families', async () => {
    const res = await request(app).get('/metrics');
    const text = res.text;
    expect(text).toMatch(/jobs_completed_total/);
    expect(text).toMatch(/jobs_failed_total/);
    expect(text).toMatch(/jobs_active_current/);
    expect(text).toMatch(/job_duration_seconds/);
    expect(text).toMatch(/job_attempts_total/);
  });
});
