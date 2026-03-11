/**
 * integration tests for redis connection layer.
 *
 * requires a live redis instance.
 * run: docker compose up redis -d (or ensure redis-server is running on localhost:6379)
 */

import IORedis from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

describe('redis integration', () => {
  let redis: IORedis;

  beforeAll(() => {
    redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: false,
    });
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('connects to redis and responds to PING', async () => {
    const response = await redis.ping();
    expect(response).toBe('PONG');
  });

  it('can set and get a key', async () => {
    const key = `test:phase1:${Date.now()}`;
    await redis.set(key, 'phase1-value', 'EX', 10);
    const value = await redis.get(key);
    expect(value).toBe('phase1-value');
    await redis.del(key);
  });

  it('confirms bullmq-compatible options work (maxRetriesPerRequest: null)', async () => {
    // if this connects without error, the options are compatible
    const result = await redis.ping();
    expect(result).toBe('PONG');
  });

  it('returns null for a non-existent key', async () => {
    const value = await redis.get('test:phase1:nonexistent:key:that:does:not:exist');
    expect(value).toBeNull();
  });
});
