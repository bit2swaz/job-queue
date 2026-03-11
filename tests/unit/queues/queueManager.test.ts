/**
 * unit tests for queueManager.ts
 *
 * bullmq Queue is mocked - no live redis needed.
 */
export {}; // force module mode to isolate type declarations

type MockQueueInstance = {
  name: string;
  close: jest.Mock;
  drain: jest.Mock;
  getJobCounts: jest.Mock;
  opts: Record<string, unknown>;
};

type MockQueueConstructor = jest.Mock<MockQueueInstance, [string, Record<string, unknown>?]>;

async function getMockQueue(): Promise<MockQueueConstructor> {
  const mod = await import('bullmq');
  return (mod as unknown as { Queue: MockQueueConstructor }).Queue;
}

jest.mock('bullmq', () => {
  const MockQueue = jest
    .fn()
    .mockImplementation((name: string, opts?: Record<string, unknown>) => ({
      name,
      opts: opts ?? {},
      close: jest.fn().mockResolvedValue(undefined),
      drain: jest.fn().mockResolvedValue(undefined),
      getJobCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 3, active: 1, delayed: 0, completed: 10, failed: 2 }),
    }));
  return { __esModule: true, Queue: MockQueue };
});

jest.mock('../../../src/services/redisClient', () => ({
  __esModule: true,
  getRedisClient: jest.fn().mockReturnValue({ status: 'ready' }),
}));

describe('queueManager', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, REDIS_URL: 'redis://localhost:6379' };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
  });

  it('getQueue creates a bullmq Queue with the given name', async () => {
    const MockQueue = await getMockQueue();
    const { getQueue } = await import('../../../src/queues/queueManager');
    getQueue('email');
    expect(MockQueue).toHaveBeenCalledWith('email', expect.any(Object));
  });

  it('getQueue returns the same Queue instance on repeated calls (singleton)', async () => {
    const { getQueue } = await import('../../../src/queues/queueManager');
    const q1 = getQueue('email');
    const q2 = getQueue('email');
    expect(q1).toBe(q2);
  });

  it('getQueue creates separate instances for different names', async () => {
    const { getQueue } = await import('../../../src/queues/queueManager');
    const qEmail = getQueue('email');
    const qReport = getQueue('report');
    expect(qEmail).not.toBe(qReport);
  });

  it('getQueue merges caller opts with defaults (connection always set)', async () => {
    const MockQueue = await getMockQueue();
    const { getQueue } = await import('../../../src/queues/queueManager');
    getQueue('report', { defaultJobOptions: { priority: 10, attempts: 5 } });
    const calls = MockQueue.mock.calls as Array<[string, Record<string, unknown>]>;
    const opts = calls[0]?.[1] ?? {};
    expect(opts['defaultJobOptions']).toMatchObject({ priority: 10, attempts: 5 });
    expect(opts['connection']).toBeDefined();
  });

  it('closeAllQueues calls close() on every registered queue', async () => {
    const { getQueue, closeAllQueues } = await import('../../../src/queues/queueManager');
    const qEmail = getQueue('email') as unknown as MockQueueInstance;
    const qReport = getQueue('report') as unknown as MockQueueInstance;
    await closeAllQueues();
    expect(qEmail.close).toHaveBeenCalled();
    expect(qReport.close).toHaveBeenCalled();
  });

  it('closeAllQueues clears the registry so subsequent getQueue creates a fresh instance', async () => {
    const { getQueue, closeAllQueues } = await import('../../../src/queues/queueManager');
    const q1 = getQueue('email');
    await closeAllQueues();
    const q2 = getQueue('email');
    expect(q1).not.toBe(q2);
  });
});
