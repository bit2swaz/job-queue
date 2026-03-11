/**
 * unit tests for redisClient.ts and redisHealth.ts
 *
 * redis itself is mocked - no live connection needed.
 * these tests verify config, initialization, and health util behavior.
 */

type MockRedisInstance = {
  quit: jest.Mock;
  ping: jest.Mock;
  info: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  on: jest.Mock;
  status: string;
  options: Record<string, unknown>;
};

type MockRedisConstructor = jest.Mock<MockRedisInstance>;

/** helper: import ioredis mock constructor with correct type */
async function getMockIORedis(): Promise<MockRedisConstructor> {
  const mod = await import('ioredis');
  return (mod as unknown as { default: MockRedisConstructor }).default;
}

// mock ioredis before any imports that use it
jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => ({
    quit: jest.fn().mockResolvedValue('OK'),
    ping: jest.fn().mockResolvedValue('PONG'),
    info: jest
      .fn()
      .mockResolvedValue('redis_version:7.0.0\nused_memory:1024\nconnected_clients:1\n'),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    on: jest.fn().mockReturnThis(),
    status: 'ready',
    options: {},
  }));

  // __esModule: true is required so that esModuleInterop does not double-wrap:
  // without it, `import IORedis from 'ioredis'` compiles to `ioredis_1.default`
  // which resolves to the whole module object instead of MockRedis.
  return { __esModule: true, default: MockRedis, Redis: MockRedis };
});

describe('redisClient', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, REDIS_URL: 'redis://localhost:6379' };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
  });

  it('creates a redis client with required bullmq-compatible options', async () => {
    const IORedis = await getMockIORedis();
    const { getRedisClient } = await import('../../../src/services/redisClient');
    getRedisClient();
    expect(IORedis).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetriesPerRequest: null,
        lazyConnect: true,
        enableReadyCheck: false,
      }),
    );
  });

  it('returns the same singleton instance on repeated calls', async () => {
    const { getRedisClient } = await import('../../../src/services/redisClient');
    const instance1 = getRedisClient();
    const instance2 = getRedisClient();
    expect(instance1).toBe(instance2);
  });

  it('enables tls when REDIS_TLS=true', async () => {
    process.env['REDIS_TLS'] = 'true';
    const IORedis = await getMockIORedis();
    const { getRedisClient } = await import('../../../src/services/redisClient');
    getRedisClient();
    expect(IORedis).toHaveBeenCalledWith(expect.objectContaining({ tls: {} }));
  });

  it('does not enable tls when REDIS_TLS is not set', async () => {
    delete process.env['REDIS_TLS'];
    const IORedis = await getMockIORedis();
    const { getRedisClient } = await import('../../../src/services/redisClient');
    getRedisClient();
    const calls = IORedis.mock.calls as Array<[Record<string, unknown>]>;
    const callArg = calls[0]?.[0];
    expect(callArg?.['tls']).toBeUndefined();
  });

  it('configures retryStrategy with exponential backoff capped at 20s', async () => {
    const IORedis = await getMockIORedis();
    const { getRedisClient } = await import('../../../src/services/redisClient');
    getRedisClient();
    const calls = IORedis.mock.calls as Array<[Record<string, unknown>]>;
    const callArg = calls[0]?.[0];
    expect(typeof callArg?.['retryStrategy']).toBe('function');
    const retryFn = callArg?.['retryStrategy'] as (times: number) => number;
    expect(retryFn(1)).toBeGreaterThanOrEqual(1000);
    expect(retryFn(100)).toBeLessThanOrEqual(20000);
  });
});

describe('redisHealth', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, REDIS_URL: 'redis://localhost:6379' };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
  });

  it('pingRedis returns true when redis responds with PONG', async () => {
    // import ioredis first to seed the module registry, then import the service
    await getMockIORedis();
    const { pingRedis } = await import('../../../src/services/redisHealth');
    const result = await pingRedis();
    expect(result).toBe(true);
  });

  it('pingRedis returns false when redis throws', async () => {
    // get the mock constructor and override implementation before importing service
    const IORedis = await getMockIORedis();
    IORedis.mockImplementationOnce(() => ({
      quit: jest.fn(),
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      info: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn().mockReturnThis(),
      status: 'end',
      options: {},
    }));
    // import service *after* setting the implementation (same registry, no resetModules)
    const { pingRedis } = await import('../../../src/services/redisHealth');
    const result = await pingRedis();
    expect(result).toBe(false);
  });

  it('getRedisInfo returns a parsed key/value record from INFO output', async () => {
    await getMockIORedis();
    const { getRedisInfo } = await import('../../../src/services/redisHealth');
    const info = await getRedisInfo();
    expect(typeof info).toBe('object');
    expect(info['redis_version']).toBe('7.0.0');
    expect(info['used_memory']).toBe('1024');
  });

  it('closeRedis calls quit on the client', async () => {
    const IORedis = await getMockIORedis();
    const { closeRedis } = await import('../../../src/services/redisHealth');
    await closeRedis();
    const instance = IORedis.mock.results[0]?.value as MockRedisInstance | undefined;
    expect(instance?.quit).toHaveBeenCalled();
  });
});
