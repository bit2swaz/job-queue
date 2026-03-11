/**
 * Unit tests for src/routes/jobs.ts
 *
 * Mocks BullMQ queues so no live Redis is needed.
 * Tests cover: 400 unknown queue, 422 invalid body, 202 submit, 404 not found,
 * 200 job status, 409 cancel non-waiting job, 200 cancel waiting job.
 */
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'jobs-route-test-secret';
process.env['JWT_SECRET'] = TEST_SECRET;

jest.mock('@queues/queueManager');
jest.mock('bullmq');

function bearerToken(sub = 'tester', role = 'operator'): string {
  return `Bearer ${jwt.sign({ sub, role }, TEST_SECRET, { expiresIn: '1h' })}`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Re-build app fresh after jest.resetModules() */
async function buildApp(): Promise<express.Application> {
  const { jobsRouter } = await import('@routes/jobs');
  const { jwtMiddleware } = await import('@auth/jwtMiddleware');

  const app = express();
  app.use(express.json());
  app.use('/jobs', jwtMiddleware, jobsRouter);
  return app;
}

// ── setup ────────────────────────────────────────────────────────────────────

let app: express.Application;

beforeEach(async () => {
  jest.resetModules();

  const { getQueue } = await import('@queues/queueManager');

  const mockJob = {
    id: 'job-001',
    name: 'email',
    data: { to: 'a@b.com', subject: 'Hi', body: 'Hello' },
    opts: { attempts: 3 },
    attemptsMade: 0,
    progress: 0,
    returnvalue: null,
    failedReason: null,
    getState: jest.fn().mockResolvedValue('waiting'),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue(mockJob),
    getJob: jest.fn().mockResolvedValue(mockJob),
    name: 'email',
  };

  (getQueue as jest.Mock).mockReturnValue(mockQueue);

  app = await buildApp();
});

// ── POST /jobs/:queue ─────────────────────────────────────────────────────────

describe('POST /jobs/:queue', () => {
  it('returns 401 when no JWT is provided', async () => {
    const res = await request(app)
      .post('/jobs/email')
      .send({ data: { to: 'x@y.com' } });
    expect(res.status).toBe(401);
  });

  it('returns 400 when queue name is unknown', async () => {
    const res = await request(app)
      .post('/jobs/unknown-queue')
      .set('Authorization', bearerToken())
      .send({ data: { foo: 'bar' } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it('returns 422 when data field is missing from body', async () => {
    const res = await request(app).post('/jobs/email').set('Authorization', bearerToken()).send({});
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ errors: expect.any(Array) });
  });

  it('returns 422 when body is not an object', async () => {
    const res = await request(app)
      .post('/jobs/email')
      .set('Authorization', bearerToken())
      .send('not-json-object');
    expect(res.status).toBe(422);
  });

  it('returns 202 with jobId, queue, and status queued on valid submit', async () => {
    const res = await request(app)
      .post('/jobs/email')
      .set('Authorization', bearerToken())
      .send({ data: { to: 'user@example.com', subject: 'Test', body: 'Body' } });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      jobId: expect.any(String),
      queue: 'email',
      status: 'queued',
    });
  });

  it('accepts optional opts in body', async () => {
    const res = await request(app)
      .post('/jobs/report')
      .set('Authorization', bearerToken())
      .send({
        data: { reportType: 'summary', userId: 'u1', format: 'pdf' },
        opts: { priority: 5, delay: 1000 },
      });
    // report queue should also be known
    expect(res.status).toBe(202);
  });
});

// ── GET /jobs/:queue/:id ──────────────────────────────────────────────────────

describe('GET /jobs/:queue/:id', () => {
  it('returns 401 when no JWT is provided', async () => {
    const res = await request(app).get('/jobs/email/job-001');
    expect(res.status).toBe(401);
  });

  it('returns 404 when job is not found', async () => {
    const { getQueue } = await import('@queues/queueManager');
    (getQueue as jest.Mock).mockReturnValue({
      getJob: jest.fn().mockResolvedValue(null),
    });
    const freshApp = await buildApp();

    const res = await request(freshApp)
      .get('/jobs/email/nonexistent')
      .set('Authorization', bearerToken());
    expect(res.status).toBe(404);
  });

  it('returns 200 with job state when job exists', async () => {
    const res = await request(app).get('/jobs/email/job-001').set('Authorization', bearerToken());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobId: expect.any(String),
      state: expect.any(String),
      data: expect.any(Object),
    });
  });

  it('returns 400 for unknown queue', async () => {
    const res = await request(app)
      .get('/jobs/unknown-queue/some-id')
      .set('Authorization', bearerToken());
    expect(res.status).toBe(400);
  });
});

// ── DELETE /jobs/:queue/:id ───────────────────────────────────────────────────

describe('DELETE /jobs/:queue/:id', () => {
  it('returns 401 when no JWT is provided', async () => {
    const res = await request(app).delete('/jobs/email/job-001');
    expect(res.status).toBe(401);
  });

  it('returns 409 when job is not in waiting state', async () => {
    const { getQueue } = await import('@queues/queueManager');
    (getQueue as jest.Mock).mockReturnValue({
      getJob: jest.fn().mockResolvedValue({
        id: 'job-001',
        getState: jest.fn().mockResolvedValue('active'),
        remove: jest.fn(),
      }),
    });
    const freshApp = await buildApp();

    const res = await request(freshApp)
      .delete('/jobs/email/job-001')
      .set('Authorization', bearerToken());
    expect(res.status).toBe(409);
  });

  it('returns 404 when job does not exist', async () => {
    const { getQueue } = await import('@queues/queueManager');
    (getQueue as jest.Mock).mockReturnValue({
      getJob: jest.fn().mockResolvedValue(null),
    });
    const freshApp = await buildApp();

    const res = await request(freshApp)
      .delete('/jobs/email/job-001')
      .set('Authorization', bearerToken());
    expect(res.status).toBe(404);
  });

  it('returns 200 and removes waiting job', async () => {
    const removeMock = jest.fn().mockResolvedValue(undefined);
    const { getQueue } = await import('@queues/queueManager');
    (getQueue as jest.Mock).mockReturnValue({
      getJob: jest.fn().mockResolvedValue({
        id: 'job-001',
        getState: jest.fn().mockResolvedValue('waiting'),
        remove: removeMock,
      }),
    });
    const freshApp = await buildApp();

    const res = await request(freshApp)
      .delete('/jobs/email/job-001')
      .set('Authorization', bearerToken());
    expect(res.status).toBe(200);
    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
