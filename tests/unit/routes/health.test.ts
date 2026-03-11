/**
 * Unit tests for src/routes/health.ts
 *
 * Mocks redisClient and queueManager to control redis health without a live connection.
 */
import request from 'supertest';
import express from 'express';

jest.mock('@services/redisClient');
jest.mock('@queues/queueManager');

import { getRedisClient } from '@services/redisClient';
import { getQueue } from '@queues/queueManager';

const mockGetRedisClient = getRedisClient as jest.MockedFunction<typeof getRedisClient>;
const mockGetQueue = getQueue as jest.MockedFunction<typeof getQueue>;

beforeEach(async () => {
  jest.resetModules();

  // re-import mocks and module after reset
  const { getRedisClient: grc } = await import('@services/redisClient');
  const { getQueue: gq } = await import('@queues/queueManager');

  // default happy-path setup
  const mockRedis = {
    ping: jest.fn().mockResolvedValue('PONG'),
  };
  (grc as jest.Mock).mockReturnValue(mockRedis);

  const mockQueue = {
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0 }),
    name: 'email',
  };
  (gq as jest.Mock).mockReturnValue(mockQueue);

  // silence unused var warnings
  void mockGetRedisClient;
  void mockGetQueue;
});

describe('GET /health', () => {
  it('returns 200 with status ok when redis responds to PING', async () => {
    const { healthRouter: router } = await import('@routes/health');
    const app = express();
    app.use('/health', router);

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('includes redis field in response', async () => {
    const { healthRouter: router } = await import('@routes/health');
    const app = express();
    app.use('/health', router);

    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('redis');
  });

  it('returns 503 when redis ping throws', async () => {
    const { getRedisClient: grc } = await import('@services/redisClient');
    (grc as jest.Mock).mockReturnValue({
      ping: jest.fn().mockRejectedValue(new Error('connection refused')),
    });

    const { healthRouter: router } = await import('@routes/health');
    const app = express();
    app.use('/health', router);

    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', redis: 'error' });
  });

  it('is publicly accessible (no auth required)', async () => {
    const { healthRouter: router } = await import('@routes/health');
    const app = express();
    app.use('/health', router);

    // no Authorization header
    const res = await request(app).get('/health');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
