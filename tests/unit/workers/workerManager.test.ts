/**
 * unit tests for workerManager.ts
 *
 * bullmq Worker is mocked - no live redis needed.
 * follows the same jest.mock + resetModules + dynamic import pattern
 * established in queueManager.test.ts.
 */
export {};

type MockWorkerInstance = {
  close: jest.Mock;
  on: jest.Mock;
  name: string;
};

type MockWorkerConstructor = jest.Mock<
  MockWorkerInstance,
  [string, unknown, Record<string, unknown>]
>;

async function getMockWorker(): Promise<MockWorkerConstructor> {
  const mod = await import('bullmq');
  return (mod as unknown as { Worker: MockWorkerConstructor }).Worker;
}

jest.mock('bullmq', () => {
  const MockWorker = jest.fn().mockImplementation((name: string) => ({
    name,
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn().mockReturnThis(),
  }));
  return { __esModule: true, Worker: MockWorker };
});

jest.mock('../../../src/services/redisClient', () => ({
  __esModule: true,
  getRedisClient: jest.fn().mockReturnValue({ status: 'ready', on: jest.fn().mockReturnThis() }),
}));

describe('workerManager', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('createWorker throws for an unknown queue name', async () => {
    const { createWorker } = await import('../../../src/workers/workerManager');
    expect(() => createWorker('bogus-queue')).toThrow(/no processor registered for queue/);
  });

  it('createWorker error message includes the unknown queue name', async () => {
    const { createWorker } = await import('../../../src/workers/workerManager');
    expect(() => createWorker('my-unknown-queue')).toThrow(/my-unknown-queue/);
  });

  it('createWorker creates a bullmq Worker with the correct queue name', async () => {
    const MockWorker = await getMockWorker();
    const { createWorker } = await import('../../../src/workers/workerManager');
    createWorker('email');
    expect(MockWorker).toHaveBeenCalledWith('email', expect.any(Function), expect.any(Object));
  });

  it('createWorker uses default concurrency 5 for the email queue', async () => {
    const MockWorker = await getMockWorker();
    const { createWorker } = await import('../../../src/workers/workerManager');
    createWorker('email');
    const calls = MockWorker.mock.calls as Array<[string, unknown, Record<string, unknown>]>;
    expect(calls[0]?.[2]?.['concurrency']).toBe(5);
  });

  it('createWorker uses default concurrency 3 for the report queue', async () => {
    const MockWorker = await getMockWorker();
    const { createWorker } = await import('../../../src/workers/workerManager');
    createWorker('report');
    const calls = MockWorker.mock.calls as Array<[string, unknown, Record<string, unknown>]>;
    expect(calls[0]?.[2]?.['concurrency']).toBe(3);
  });

  it('createWorker uses default concurrency 10 for the notify queue', async () => {
    const MockWorker = await getMockWorker();
    const { createWorker } = await import('../../../src/workers/workerManager');
    createWorker('notify');
    const calls = MockWorker.mock.calls as Array<[string, unknown, Record<string, unknown>]>;
    expect(calls[0]?.[2]?.['concurrency']).toBe(10);
  });

  it('createWorker accepts and uses an explicit concurrency override', async () => {
    const MockWorker = await getMockWorker();
    const { createWorker } = await import('../../../src/workers/workerManager');
    createWorker('email', 20);
    const calls = MockWorker.mock.calls as Array<[string, unknown, Record<string, unknown>]>;
    expect(calls[0]?.[2]?.['concurrency']).toBe(20);
  });

  it('createWorker includes the rate limiter { max: 100, duration: 1000 } in worker options', async () => {
    const MockWorker = await getMockWorker();
    const { createWorker } = await import('../../../src/workers/workerManager');
    createWorker('email');
    const calls = MockWorker.mock.calls as Array<[string, unknown, Record<string, unknown>]>;
    expect(calls[0]?.[2]?.['limiter']).toEqual({ max: 100, duration: 1000 });
  });

  it('createWorker passes a connection option derived from getRedisClient()', async () => {
    const MockWorker = await getMockWorker();
    const { createWorker } = await import('../../../src/workers/workerManager');
    createWorker('email');
    const calls = MockWorker.mock.calls as Array<[string, unknown, Record<string, unknown>]>;
    expect(calls[0]?.[2]?.['connection']).toBeDefined();
  });

  it('createWorker attaches a completed event listener on the worker', async () => {
    const { createWorker } = await import('../../../src/workers/workerManager');
    const worker = createWorker('email') as unknown as MockWorkerInstance;
    expect(worker.on).toHaveBeenCalledWith('completed', expect.any(Function));
  });

  it('createWorker attaches a failed event listener on the worker', async () => {
    const { createWorker } = await import('../../../src/workers/workerManager');
    const worker = createWorker('email') as unknown as MockWorkerInstance;
    expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('createWorker attaches an error event listener on the worker', async () => {
    const { createWorker } = await import('../../../src/workers/workerManager');
    const worker = createWorker('email') as unknown as MockWorkerInstance;
    expect(worker.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('createWorker returns the same Worker instance on repeated calls (singleton)', async () => {
    const { createWorker } = await import('../../../src/workers/workerManager');
    const w1 = createWorker('email');
    const w2 = createWorker('email');
    expect(w1).toBe(w2);
  });

  it('createWorker creates separate instances for different queue names', async () => {
    const { createWorker } = await import('../../../src/workers/workerManager');
    const wEmail = createWorker('email');
    const wReport = createWorker('report');
    expect(wEmail).not.toBe(wReport);
  });

  it('closeAllWorkers calls close() on every registered worker', async () => {
    const { createWorker, closeAllWorkers } = await import('../../../src/workers/workerManager');
    const wEmail = createWorker('email') as unknown as MockWorkerInstance;
    const wReport = createWorker('report') as unknown as MockWorkerInstance;
    await closeAllWorkers();
    expect(wEmail.close).toHaveBeenCalled();
    expect(wReport.close).toHaveBeenCalled();
  });

  it('closeAllWorkers clears the registry so next createWorker creates a fresh instance', async () => {
    const { createWorker, closeAllWorkers } = await import('../../../src/workers/workerManager');
    const w1 = createWorker('email');
    await closeAllWorkers();
    const w2 = createWorker('email');
    expect(w1).not.toBe(w2);
  });
});
