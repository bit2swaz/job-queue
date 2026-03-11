/**
 * unit tests for deadLetterService.ts
 *
 * bullmq QueueEvents, queueManager.getQueue, alertService.notifyAlerts,
 * and redisClient are all mocked - no live redis needed.
 *
 * note: use MockQueueEvents.mock.results[0].value (not .instances[0]) to get
 * the returned mock instance, because the factory returns a plain object from
 * mockImplementation rather than mutating `this`.
 */
export {};

type MockQueueEventsInstance = {
  on: jest.Mock;
  close: jest.Mock;
};

type MockQueueEventsConstructor = jest.Mock<MockQueueEventsInstance, [string, unknown]>;

jest.mock('bullmq', () => {
  const MockQueueEvents = jest.fn().mockImplementation(() => ({
    on: jest.fn().mockReturnThis(),
    close: jest.fn().mockResolvedValue(undefined),
  }));
  return { __esModule: true, QueueEvents: MockQueueEvents };
});

jest.mock('../../../src/queues/queueManager', () => ({
  __esModule: true,
  getQueue: jest.fn(),
}));

jest.mock('../../../src/services/alertService', () => ({
  __esModule: true,
  notifyAlerts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/services/redisClient', () => ({
  __esModule: true,
  getRedisClient: jest.fn().mockReturnValue({ status: 'ready' }),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function getMockQueueEvents(): Promise<MockQueueEventsConstructor> {
  const mod = await import('bullmq');
  return (mod as unknown as { QueueEvents: MockQueueEventsConstructor }).QueueEvents;
}

async function getMockGetQueue(): Promise<jest.Mock> {
  const mod = await import('../../../src/queues/queueManager');
  return mod.getQueue as jest.Mock;
}

async function getMockNotifyAlerts(): Promise<jest.Mock> {
  const mod = await import('../../../src/services/alertService');
  return mod.notifyAlerts as jest.Mock;
}

async function getDeadLetterService() {
  return import('../../../src/services/deadLetterService');
}

// use mock.results[idx].value - the plain object returned by the factory
function getQueueEventsResult(
  MockQE: MockQueueEventsConstructor,
  idx = 0,
): MockQueueEventsInstance {
  const entry = MockQE.mock.results[idx];
  if (!entry || entry.type !== 'return') {
    throw new Error(`QueueEvents was not instantiated (idx=${idx})`);
  }
  return entry.value as MockQueueEventsInstance;
}

async function setupAndCaptureFailedHandler(
  queueName: string,
  mockJob: unknown,
): Promise<{
  failedHandler: (payload: { jobId: string; failedReason: string }) => Promise<void>;
  dlqAddMock: jest.Mock;
  mockGetQueue: jest.Mock;
  MockQueueEvents: MockQueueEventsConstructor;
}> {
  const MockQueueEvents = await getMockQueueEvents();
  const mockGetQueue = await getMockGetQueue();
  const dlqAddMock = jest.fn().mockResolvedValue({ id: 'dlq-job-1' });
  const sourceGetJobMock = jest.fn().mockResolvedValue(mockJob);

  mockGetQueue.mockImplementation((name: string) => {
    if (name === 'dlq') return { add: dlqAddMock };
    return { getJob: sourceGetJobMock };
  });

  const { watchForDeadLetters } = await getDeadLetterService();
  watchForDeadLetters(queueName);

  const instance = getQueueEventsResult(MockQueueEvents);
  const failedCallArgs = (instance.on as jest.Mock).mock.calls.find(
    (c: unknown[]) => c[0] === 'failed',
  );
  const failedHandler = failedCallArgs?.[1] as (payload: {
    jobId: string;
    failedReason: string;
  }) => Promise<void>;

  return { failedHandler, dlqAddMock, mockGetQueue, MockQueueEvents };
}

describe('deadLetterService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('watchForDeadLetters', () => {
    it('creates a QueueEvents instance for the given queue name', async () => {
      const MockQueueEvents = await getMockQueueEvents();
      const mockGetQueue = await getMockGetQueue();
      mockGetQueue.mockReturnValue({ getJob: jest.fn(), add: jest.fn() });

      const { watchForDeadLetters } = await getDeadLetterService();
      watchForDeadLetters('email');

      expect(MockQueueEvents).toHaveBeenCalledWith('email', expect.any(Object));
    });

    it('returns the QueueEvents instance', async () => {
      const MockQueueEvents = await getMockQueueEvents();
      const mockGetQueue = await getMockGetQueue();
      mockGetQueue.mockReturnValue({ getJob: jest.fn(), add: jest.fn() });

      const { watchForDeadLetters } = await getDeadLetterService();
      const result = watchForDeadLetters('email');

      expect(result).toBe(getQueueEventsResult(MockQueueEvents));
    });

    it('registers a failed listener on the QueueEvents instance', async () => {
      const MockQueueEvents = await getMockQueueEvents();
      const mockGetQueue = await getMockGetQueue();
      mockGetQueue.mockReturnValue({ getJob: jest.fn(), add: jest.fn() });

      const { watchForDeadLetters } = await getDeadLetterService();
      watchForDeadLetters('email');

      const instance = getQueueEventsResult(MockQueueEvents);
      expect(instance.on).toHaveBeenCalledWith('failed', expect.any(Function));
    });

    it('does not route to DLQ when the job is null', async () => {
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('email', null);
      await failedHandler({ jobId: 'job-1', failedReason: 'crash' });
      expect(dlqAddMock).not.toHaveBeenCalled();
    });

    it('does not route to DLQ when attemptsMade is less than attempts', async () => {
      const mockJob = {
        id: 'job-1',
        data: { to: 'x@x.com' },
        attemptsMade: 1,
        opts: { attempts: 3 },
      };
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('email', mockJob);
      await failedHandler({ jobId: 'job-1', failedReason: 'timeout' });
      expect(dlqAddMock).not.toHaveBeenCalled();
    });

    it('routes to DLQ when attemptsMade equals attempts', async () => {
      const mockJob = {
        id: 'job-1',
        data: { to: 'x@x.com' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      };
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('email', mockJob);
      await failedHandler({ jobId: 'job-1', failedReason: 'timeout' });
      expect(dlqAddMock).toHaveBeenCalled();
    });

    it('routes to DLQ when attemptsMade exceeds attempts', async () => {
      const mockJob = { id: 'job-2', data: {}, attemptsMade: 4, opts: { attempts: 3 } };
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('email', mockJob);
      await failedHandler({ jobId: 'job-2', failedReason: 'crash' });
      expect(dlqAddMock).toHaveBeenCalled();
    });

    it('routes with correct payload: originalQueue matches queueName', async () => {
      const mockJob = {
        id: 'job-1',
        data: { to: 'x@x.com' },
        attemptsMade: 2,
        opts: { attempts: 2 },
      };
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('notify', mockJob);
      await failedHandler({ jobId: 'job-1', failedReason: 'http 500' });
      expect(dlqAddMock).toHaveBeenCalledWith(
        'dead-letter',
        expect.objectContaining({ originalQueue: 'notify' }),
      );
    });

    it('routes with correct payload: jobId matches the event jobId', async () => {
      const mockJob = { id: 'job-42', data: {}, attemptsMade: 1, opts: { attempts: 1 } };
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('report', mockJob);
      await failedHandler({ jobId: 'job-42', failedReason: 'oom' });
      expect(dlqAddMock).toHaveBeenCalledWith(
        'dead-letter',
        expect.objectContaining({ jobId: 'job-42' }),
      );
    });

    it('routes with correct payload: data comes from the job', async () => {
      const originalData = { reportType: 'pdf', userId: 'u1' };
      const mockJob = { id: 'job-3', data: originalData, attemptsMade: 3, opts: { attempts: 3 } };
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('report', mockJob);
      await failedHandler({ jobId: 'job-3', failedReason: 'oom' });
      expect(dlqAddMock).toHaveBeenCalledWith(
        'dead-letter',
        expect.objectContaining({ data: originalData }),
      );
    });

    it('routes with correct payload: failedReason matches the event failedReason', async () => {
      const mockJob = { id: 'job-4', data: {}, attemptsMade: 2, opts: { attempts: 2 } };
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('email', mockJob);
      await failedHandler({ jobId: 'job-4', failedReason: 'smtp rejected' });
      expect(dlqAddMock).toHaveBeenCalledWith(
        'dead-letter',
        expect.objectContaining({ failedReason: 'smtp rejected' }),
      );
    });

    it('routes with correct payload: failedAt is a number', async () => {
      const mockJob = { id: 'job-5', data: {}, attemptsMade: 1, opts: { attempts: 1 } };
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('email', mockJob);
      await failedHandler({ jobId: 'job-5', failedReason: 'crash' });
      const payload = dlqAddMock.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(typeof payload['failedAt']).toBe('number');
    });

    it('calls notifyAlerts with the dlqJobData after routing', async () => {
      const mockJob = { id: 'job-6', data: {}, attemptsMade: 3, opts: { attempts: 3 } };
      const MockQueueEvents = await getMockQueueEvents();
      const mockGetQueue = await getMockGetQueue();
      const mockNotifyAlerts = await getMockNotifyAlerts();
      const dlqAddMock = jest.fn().mockResolvedValue({ id: 'dlq-6' });

      mockGetQueue.mockImplementation((name: string) => {
        if (name === 'dlq') return { add: dlqAddMock };
        return { getJob: jest.fn().mockResolvedValue(mockJob) };
      });

      const { watchForDeadLetters } = await getDeadLetterService();
      watchForDeadLetters('email');

      const instance = getQueueEventsResult(MockQueueEvents);
      const call = (instance.on as jest.Mock).mock.calls.find((c: unknown[]) => c[0] === 'failed');
      const handler = call?.[1] as (p: { jobId: string; failedReason: string }) => Promise<void>;
      await handler({ jobId: 'job-6', failedReason: 'timeout' });

      expect(mockNotifyAlerts).toHaveBeenCalledWith(
        expect.objectContaining({ originalQueue: 'email', jobId: 'job-6' }),
      );
    });

    it('emits dlq:routed event on dlqEmitter after routing', async () => {
      const mockJob = {
        id: 'job-7',
        data: { foo: 'bar' },
        attemptsMade: 1,
        opts: { attempts: 1 },
      };
      const MockQueueEvents = await getMockQueueEvents();
      const mockGetQueue = await getMockGetQueue();
      const dlqAddMock = jest.fn().mockResolvedValue({ id: 'dlq-7' });

      mockGetQueue.mockImplementation((name: string) => {
        if (name === 'dlq') return { add: dlqAddMock };
        return { getJob: jest.fn().mockResolvedValue(mockJob) };
      });

      const { watchForDeadLetters, dlqEmitter } = await getDeadLetterService();
      const emitSpy = jest.spyOn(dlqEmitter, 'emit');

      watchForDeadLetters('notify');
      const instance = getQueueEventsResult(MockQueueEvents);
      const call = (instance.on as jest.Mock).mock.calls.find((c: unknown[]) => c[0] === 'failed');
      const handler = call?.[1] as (p: { jobId: string; failedReason: string }) => Promise<void>;
      await handler({ jobId: 'job-7', failedReason: 'crash' });

      expect(emitSpy).toHaveBeenCalledWith(
        'dlq:routed',
        expect.objectContaining({ jobId: 'job-7' }),
      );
    });

    it('uses opts.attempts defaulting to 1 when opts.attempts is undefined', async () => {
      // attemptsMade=1 with no attempts field should trigger dlq (default max=1)
      const mockJob = { id: 'job-8', data: {}, attemptsMade: 1, opts: {} };
      const { failedHandler, dlqAddMock } = await setupAndCaptureFailedHandler('email', mockJob);
      await failedHandler({ jobId: 'job-8', failedReason: 'no attempts field' });
      expect(dlqAddMock).toHaveBeenCalled();
    });
  });

  describe('getDLQStats', () => {
    it('returns the total count across all job states', async () => {
      const mockGetQueue = await getMockGetQueue();
      mockGetQueue.mockReturnValue({
        getJobCounts: jest
          .fn()
          .mockResolvedValue({ waiting: 2, active: 1, failed: 3, completed: 0 }),
        getWaiting: jest.fn().mockResolvedValue([]),
        getFailed: jest.fn().mockResolvedValue([]),
      });

      const { getDLQStats } = await getDeadLetterService();
      const stats = await getDLQStats();

      expect(stats.count).toBe(6);
    });

    it('returns the oldest waiting job as oldestJob', async () => {
      const mockGetQueue = await getMockGetQueue();
      const oldestJob = { id: 'dlq-oldest', data: { failedReason: 'oom' } };
      mockGetQueue.mockReturnValue({
        getJobCounts: jest
          .fn()
          .mockResolvedValue({ waiting: 1, active: 0, failed: 0, completed: 0 }),
        getWaiting: jest.fn().mockResolvedValue([oldestJob]),
        getFailed: jest.fn().mockResolvedValue([]),
      });

      const { getDLQStats } = await getDeadLetterService();
      const stats = await getDLQStats();

      expect(stats.oldestJob).toBe(oldestJob);
    });

    it('returns null for oldestJob when no waiting jobs', async () => {
      const mockGetQueue = await getMockGetQueue();
      mockGetQueue.mockReturnValue({
        getJobCounts: jest
          .fn()
          .mockResolvedValue({ waiting: 0, active: 0, failed: 0, completed: 0 }),
        getWaiting: jest.fn().mockResolvedValue([]),
        getFailed: jest.fn().mockResolvedValue([]),
      });

      const { getDLQStats } = await getDeadLetterService();
      const stats = await getDLQStats();

      expect(stats.oldestJob).toBeNull();
    });

    it('returns recentFailureReason from the first failed job data', async () => {
      const mockGetQueue = await getMockGetQueue();
      const failedJob = {
        data: {
          originalQueue: 'email',
          jobId: 'j1',
          failedReason: 'smtp error',
          failedAt: 1,
        },
      };
      mockGetQueue.mockReturnValue({
        getJobCounts: jest
          .fn()
          .mockResolvedValue({ waiting: 0, active: 0, failed: 1, completed: 0 }),
        getWaiting: jest.fn().mockResolvedValue([]),
        getFailed: jest.fn().mockResolvedValue([failedJob]),
      });

      const { getDLQStats } = await getDeadLetterService();
      const stats = await getDLQStats();

      expect(stats.recentFailureReason).toBe('smtp error');
    });

    it('returns null for recentFailureReason when no failed jobs', async () => {
      const mockGetQueue = await getMockGetQueue();
      mockGetQueue.mockReturnValue({
        getJobCounts: jest
          .fn()
          .mockResolvedValue({ waiting: 0, active: 0, failed: 0, completed: 0 }),
        getWaiting: jest.fn().mockResolvedValue([]),
        getFailed: jest.fn().mockResolvedValue([]),
      });

      const { getDLQStats } = await getDeadLetterService();
      const stats = await getDLQStats();

      expect(stats.recentFailureReason).toBeNull();
    });
  });

  describe('replayDLQJob', () => {
    it('throws an error when the dlq job is not found', async () => {
      const mockGetQueue = await getMockGetQueue();
      mockGetQueue.mockReturnValue({ getJob: jest.fn().mockResolvedValue(null) });

      const { replayDLQJob } = await getDeadLetterService();
      await expect(replayDLQJob('nonexistent')).rejects.toThrow(/dlq job not found/);
    });

    it('re-adds the original job data to the original queue', async () => {
      const mockGetQueue = await getMockGetQueue();
      const originalData = { to: 'user@example.com' };
      const dlqJob = {
        data: {
          originalQueue: 'email',
          jobId: 'orig-1',
          data: originalData,
          failedReason: 'x',
          failedAt: 1,
        },
      };
      const originalQueueAdd = jest.fn().mockResolvedValue({ id: 'new-1' });

      mockGetQueue.mockImplementation((name: string) => {
        if (name === 'dlq') return { getJob: jest.fn().mockResolvedValue(dlqJob) };
        if (name === 'email') return { add: originalQueueAdd };
        return {};
      });

      const { replayDLQJob } = await getDeadLetterService();
      await replayDLQJob('dlq-job-1');

      expect(originalQueueAdd).toHaveBeenCalledWith('replayed-job', originalData);
    });

    it('resolves without error when replay succeeds', async () => {
      const mockGetQueue = await getMockGetQueue();
      const dlqJob = {
        data: {
          originalQueue: 'report',
          jobId: 'orig-2',
          data: {},
          failedReason: 'x',
          failedAt: 1,
        },
      };
      mockGetQueue.mockImplementation((name: string) => {
        if (name === 'dlq') return { getJob: jest.fn().mockResolvedValue(dlqJob) };
        return { add: jest.fn().mockResolvedValue({ id: 'new-2' }) };
      });

      const { replayDLQJob } = await getDeadLetterService();
      await expect(replayDLQJob('dlq-job-2')).resolves.toBeUndefined();
    });
  });
});
