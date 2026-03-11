/**
 * unit tests for queues.ts (named queue instances)
 * and queueUtils.ts (drainQueue, getQueueDepth)
 *
 * bullmq Queue is mocked throughout.
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
        .mockResolvedValue({ waiting: 3, active: 1, delayed: 2, completed: 10, failed: 2 }),
    }));
  return { __esModule: true, Queue: MockQueue };
});

jest.mock('../../../src/services/redisClient', () => ({
  __esModule: true,
  getRedisClient: jest.fn().mockReturnValue({ status: 'ready' }),
}));

describe('named queues (queues.ts)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('emailQueue is created with name "email"', async () => {
    const MockQueue = await getMockQueue();
    await import('../../../src/queues/queues');
    const calls = MockQueue.mock.calls as Array<[string, Record<string, unknown>]>;
    const names = calls.map((c) => c[0]);
    expect(names).toContain('email');
  });

  it('reportQueue is created with name "report" and priority:10 attempts:5 in defaultJobOptions', async () => {
    const MockQueue = await getMockQueue();
    await import('../../../src/queues/queues');
    const calls = MockQueue.mock.calls as Array<[string, Record<string, unknown>]>;
    const reportCall = calls.find((c) => c[0] === 'report');
    expect(reportCall).toBeDefined();
    const opts = reportCall?.[1] ?? {};
    const djo = opts['defaultJobOptions'] as Record<string, unknown> | undefined;
    expect(djo?.['priority']).toBe(10);
    expect(djo?.['attempts']).toBe(5);
  });

  it('notifyQueue is created with name "notify"', async () => {
    const MockQueue = await getMockQueue();
    await import('../../../src/queues/queues');
    const calls = MockQueue.mock.calls as Array<[string, Record<string, unknown>]>;
    const names = calls.map((c) => c[0]);
    expect(names).toContain('notify');
  });

  it('dlq is created with name "dlq"', async () => {
    const MockQueue = await getMockQueue();
    await import('../../../src/queues/queues');
    const calls = MockQueue.mock.calls as Array<[string, Record<string, unknown>]>;
    const names = calls.map((c) => c[0]);
    expect(names).toContain('dlq');
  });
});

describe('queueUtils', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('drainQueue calls drain() on the named queue', async () => {
    await getMockQueue();
    const { getQueue } = await import('../../../src/queues/queueManager');
    const q = getQueue('email') as unknown as MockQueueInstance;
    const { drainQueue } = await import('../../../src/queues/queueUtils');
    await drainQueue('email');
    expect(q.drain).toHaveBeenCalled();
  });

  it('getQueueDepth returns waiting/active/delayed/completed/failed counts', async () => {
    await getMockQueue();
    const utils = await import('../../../src/queues/queueUtils');
    const depth = await utils.getQueueDepth('email');
    expect(typeof depth.waiting).toBe('number');
    expect(typeof depth.active).toBe('number');
    expect(typeof depth.delayed).toBe('number');
    expect(typeof depth.completed).toBe('number');
    expect(typeof depth.failed).toBe('number');
  });

  it('getQueueDepth returns the raw counts from getJobCounts', async () => {
    await getMockQueue();
    const { getQueueDepth } = await import('../../../src/queues/queueUtils');
    const depth = await getQueueDepth('email');
    expect(depth.waiting).toBe(3);
    expect(depth.active).toBe(1);
    expect(depth.delayed).toBe(2);
    expect(depth.completed).toBe(10);
    expect(depth.failed).toBe(2);
  });
});
