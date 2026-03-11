/**
 * Unit tests for Phase 8 — Prometheus metrics.
 *
 * Tests two things independently:
 *  1. The metrics registry: all 5 metric descriptors are registered.
 *  2. attachMetrics(): emitting worker events increments/observes the correct
 *     metric with the correct labels.
 *
 * prom-client and the observability modules are imported for real; BullMQ
 * Worker is replaced with a bare EventEmitter that fires the same events.
 */

import { EventEmitter } from 'events';
import type { Registry } from 'prom-client';
import type { Worker, Job } from 'bullmq';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Minimal stand-in for a BullMQ Worker.
 * Only the event-emitter surface is exercised in these unit tests.
 */
function makeWorkerStub(queueName: string): Worker {
  const emitter = new EventEmitter() as unknown as Worker;
  Object.defineProperty(emitter, 'name', { value: queueName });
  return emitter;
}

/**
 * Returns the current numeric value of a named counter/gauge for a given
 * queue label from the supplied registry.
 */
async function getMetricValue(
  reg: Registry,
  metricName: string,
  queueLabel: string,
): Promise<number | undefined> {
  const metric = reg.getSingleMetric(metricName);
  if (!metric) return undefined;
  const values = await metric.get();
  const found = values.values.find((v) => v.labels['queue'] === queueLabel);
  return found?.value;
}

// ── module state isolation ────────────────────────────────────────────────────

// Reset the module registry between test suites so metrics don't bleed across.
let register: Registry;
let attachMetrics: (worker: Worker) => void;

beforeEach(async () => {
  jest.resetModules();
  // Fresh prom-client Registry for every test run.
  ({ register } = await import('../../../src/observability/metrics'));
  ({ attachMetrics } = await import('../../../src/observability/workerMetrics'));
  // Clear all metric values before each test.
  register.resetMetrics();
});

// ── metric registry tests ─────────────────────────────────────────────────────

describe('metrics registry', () => {
  it('registers jobs_completed_total counter', () => {
    expect(register.getSingleMetric('jobs_completed_total')).toBeDefined();
  });

  it('registers jobs_failed_total counter', () => {
    expect(register.getSingleMetric('jobs_failed_total')).toBeDefined();
  });

  it('registers jobs_active_current gauge', () => {
    expect(register.getSingleMetric('jobs_active_current')).toBeDefined();
  });

  it('registers job_duration_seconds histogram', () => {
    expect(register.getSingleMetric('job_duration_seconds')).toBeDefined();
  });

  it('registers job_attempts_total histogram', () => {
    expect(register.getSingleMetric('job_attempts_total')).toBeDefined();
  });
});

// ── attachMetrics hook tests ──────────────────────────────────────────────────

describe('attachMetrics', () => {
  it('increments jobs_completed_total when worker emits completed', async () => {
    const worker = makeWorkerStub('email');
    attachMetrics(worker);

    const fakeJob = {
      id: '1',
      timestamp: Date.now() - 500,
      processedOn: Date.now(),
      attemptsMade: 1,
    } as unknown as Job;

    (worker as unknown as EventEmitter).emit('completed', fakeJob, undefined);

    const val = await getMetricValue(register, 'jobs_completed_total', 'email');
    expect(val).toBe(1);
  });

  it('increments jobs_failed_total when worker emits failed', async () => {
    const worker = makeWorkerStub('report');
    attachMetrics(worker);

    const fakeJob = { id: '2', attemptsMade: 3 } as unknown as Job;
    (worker as unknown as EventEmitter).emit('failed', fakeJob, new Error('boom'));

    const val = await getMetricValue(register, 'jobs_failed_total', 'report');
    expect(val).toBe(1);
  });

  it('increments jobs_active_current when worker emits active', async () => {
    const worker = makeWorkerStub('notify');
    attachMetrics(worker);

    const fakeJob = { id: '3' } as unknown as Job;
    (worker as unknown as EventEmitter).emit('active', fakeJob);

    const val = await getMetricValue(register, 'jobs_active_current', 'notify');
    expect(val).toBe(1);
  });

  it('observes job_duration_seconds on completed with correct seconds value', async () => {
    const worker = makeWorkerStub('email');
    attachMetrics(worker);

    const now = Date.now();
    const fakeJob = {
      id: '4',
      timestamp: now - 2000, // 2 seconds ago
      processedOn: now,
      attemptsMade: 1,
    } as unknown as Job;

    (worker as unknown as EventEmitter).emit('completed', fakeJob, undefined);

    const metric = register.getSingleMetric('job_duration_seconds');
    expect(metric).toBeDefined();
    const values = await metric!.get();
    // Histogram sum for 'email' should be approximately 2 seconds
    type RawMetricValue = { labels: Record<string, string>; metricName: string; value: number };
    const sumEntry = (values.values as unknown as RawMetricValue[]).find(
      (v) => v.labels['queue'] === 'email' && v.metricName === 'job_duration_seconds_sum',
    );
    expect(sumEntry).toBeDefined();
    expect(sumEntry!.value).toBeGreaterThanOrEqual(1.5);
    expect(sumEntry!.value).toBeLessThanOrEqual(3);
  });

  it('observes job_attempts_total on completed', async () => {
    const worker = makeWorkerStub('email');
    attachMetrics(worker);

    const fakeJob = {
      id: '5',
      timestamp: Date.now() - 100,
      processedOn: Date.now(),
      attemptsMade: 2,
    } as unknown as Job;

    (worker as unknown as EventEmitter).emit('completed', fakeJob, undefined);

    const metric = register.getSingleMetric('job_attempts_total');
    expect(metric).toBeDefined();
    const values = await metric!.get();
    type RawMetricValue = { labels: Record<string, string>; metricName: string; value: number };
    const sumEntry = (values.values as unknown as RawMetricValue[]).find(
      (v) => v.labels['queue'] === 'email' && v.metricName === 'job_attempts_total_sum',
    );
    expect(sumEntry).toBeDefined();
    expect(sumEntry!.value).toBe(2);
  });
});
