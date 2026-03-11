/**
 * unit tests for alertService.ts
 *
 * no external i/o - logger and fetch are mocked.
 * each test gets a fresh module via resetModules + dynamic import to avoid
 * the auto-registered consoleAlertHook leaking across tests.
 */
export {};

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// mock global fetch
const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
global.fetch = mockFetch as typeof fetch;

async function getAlertService() {
  const mod = await import('../../../src/services/alertService');
  return mod;
}

async function getLogger() {
  const mod = await import('../../../src/utils/logger');
  return mod.logger;
}

describe('alertService', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env['SLACK_WEBHOOK_URL'];
  });

  describe('registerAlertHook', () => {
    it('registers a hook that is then called by notifyAlerts', async () => {
      const { registerAlertHook, notifyAlerts } = await getAlertService();
      const hook = jest.fn().mockResolvedValue(undefined);
      const dlqJob = {
        originalQueue: 'email',
        jobId: 'job-1',
        data: {},
        failedReason: 'timeout',
        failedAt: Date.now(),
      };

      registerAlertHook(hook);
      await notifyAlerts(dlqJob);

      expect(hook).toHaveBeenCalledWith(dlqJob);
    });

    it('allows multiple hooks to be registered', async () => {
      const { registerAlertHook, notifyAlerts } = await getAlertService();
      const hook1 = jest.fn().mockResolvedValue(undefined);
      const hook2 = jest.fn().mockResolvedValue(undefined);
      const dlqJob = {
        originalQueue: 'email',
        jobId: 'job-2',
        data: {},
        failedReason: 'crash',
        failedAt: Date.now(),
      };

      registerAlertHook(hook1);
      registerAlertHook(hook2);
      await notifyAlerts(dlqJob);

      expect(hook1).toHaveBeenCalledWith(dlqJob);
      expect(hook2).toHaveBeenCalledWith(dlqJob);
    });
  });

  describe('notifyAlerts', () => {
    it('calls all registered hooks', async () => {
      const { registerAlertHook, notifyAlerts } = await getAlertService();
      const hookA = jest.fn().mockResolvedValue(undefined);
      const hookB = jest.fn().mockResolvedValue(undefined);
      const dlqJob = {
        originalQueue: 'notify',
        jobId: 'job-3',
        data: { event: 'signup' },
        failedReason: 'connection refused',
        failedAt: Date.now(),
      };

      registerAlertHook(hookA);
      registerAlertHook(hookB);
      await notifyAlerts(dlqJob);

      expect(hookA).toHaveBeenCalledTimes(1);
      expect(hookB).toHaveBeenCalledTimes(1);
    });

    it('does not propagate errors thrown by individual hooks', async () => {
      const { registerAlertHook, notifyAlerts } = await getAlertService();
      const failingHook = jest.fn().mockRejectedValue(new Error('hook blew up'));
      const safeHook = jest.fn().mockResolvedValue(undefined);
      const dlqJob = {
        originalQueue: 'report',
        jobId: 'job-4',
        data: {},
        failedReason: 'oom',
        failedAt: Date.now(),
      };

      registerAlertHook(failingHook);
      registerAlertHook(safeHook);

      await expect(notifyAlerts(dlqJob)).resolves.toBeUndefined();
      expect(safeHook).toHaveBeenCalledWith(dlqJob);
    });

    it('logs an error when a hook throws', async () => {
      const { registerAlertHook, notifyAlerts } = await getAlertService();
      const logger = await getLogger();
      const boom = new Error('hook error');
      const failingHook = jest.fn().mockRejectedValue(boom);
      const dlqJob = {
        originalQueue: 'email',
        jobId: 'job-5',
        data: {},
        failedReason: 'fail',
        failedAt: Date.now(),
      };

      registerAlertHook(failingHook);
      await notifyAlerts(dlqJob);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: boom, jobId: 'job-5' }),
        expect.any(String),
      );
    });
  });

  describe('consoleAlertHook', () => {
    it('calls logger.error with jobId, originalQueue, and failedReason', async () => {
      const { consoleAlertHook } = await getAlertService();
      const logger = await getLogger();
      const dlqJob = {
        originalQueue: 'email',
        jobId: 'job-6',
        data: {},
        failedReason: 'smtp error',
        failedAt: Date.now(),
      };

      await consoleAlertHook(dlqJob);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-6',
          originalQueue: 'email',
          failedReason: 'smtp error',
        }),
        expect.any(String),
      );
    });
  });

  describe('slackAlertHook', () => {
    it('does nothing when SLACK_WEBHOOK_URL is not set', async () => {
      delete process.env['SLACK_WEBHOOK_URL'];
      const { slackAlertHook } = await getAlertService();
      const dlqJob = {
        originalQueue: 'email',
        jobId: 'job-7',
        data: {},
        failedReason: 'timeout',
        failedAt: Date.now(),
      };

      await slackAlertHook(dlqJob);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('calls fetch with the slack webhook url when SLACK_WEBHOOK_URL is set', async () => {
      process.env['SLACK_WEBHOOK_URL'] = 'https://hooks.slack.com/test';
      const { slackAlertHook } = await getAlertService();
      const dlqJob = {
        originalQueue: 'notify',
        jobId: 'job-8',
        data: {},
        failedReason: 'connection timeout',
        failedAt: Date.now(),
      };

      await slackAlertHook(dlqJob);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sends a json body containing the jobId and originalQueue', async () => {
      process.env['SLACK_WEBHOOK_URL'] = 'https://hooks.slack.com/test';
      const { slackAlertHook } = await getAlertService();
      const dlqJob = {
        originalQueue: 'report',
        jobId: 'job-9',
        data: {},
        failedReason: 'oom',
        failedAt: Date.now(),
      };

      await slackAlertHook(dlqJob);

      const callArgs = mockFetch.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(callArgs[1].body) as { text: string };
      expect(body.text).toContain('job-9');
      expect(body.text).toContain('report');
    });
  });

  describe('auto-registration', () => {
    it('consoleAlertHook is automatically registered on module load', async () => {
      const { notifyAlerts, consoleAlertHook } = await getAlertService();
      const logger = await getLogger();
      const dlqJob = {
        originalQueue: 'email',
        jobId: 'job-auto',
        data: {},
        failedReason: 'auto test',
        failedAt: Date.now(),
      };

      // spy on the hook directly
      const spy = jest.spyOn({ consoleAlertHook }, 'consoleAlertHook');
      void spy;

      // calling notifyAlerts should call the already-registered consoleAlertHook
      await notifyAlerts(dlqJob);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-auto' }),
        expect.any(String),
      );
    });
  });
});
