import { notifyProcessor, type NotifyJobData } from '../../../src/processors/notifyProcessor';
import { ValidationError, TransientError } from '../../../src/processors/errors';

type MockJob = {
  data: NotifyJobData;
  log: jest.Mock;
  updateProgress: jest.Mock;
};

function makeJob(data: Partial<NotifyJobData> = {}): MockJob {
  return {
    data: {
      webhookUrl: 'https://hooks.example.com/notify',
      event: 'user.created',
      payload: { userId: 'abc123' },
      ...data,
    },
    log: jest.fn().mockResolvedValue(0),
    updateProgress: jest.fn().mockResolvedValue(undefined),
  };
}

function stubFetchOk(status = 200): void {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    status,
    statusText: 'OK',
  } as Response);
}

function stubFetchError(status: number, statusText: string): void {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: false,
    status,
    statusText,
  } as Response);
}

function stubFetchNetworkError(message: string): void {
  jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error(message));
}

describe('notifyProcessor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws ValidationError for a completely invalid webhookUrl', async () => {
    const job = makeJob({ webhookUrl: 'not-a-url-at-all' });
    await expect(notifyProcessor(job as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for a non-http scheme (ftp)', async () => {
    const job = makeJob({ webhookUrl: 'ftp://hooks.example.com/notify' });
    await expect(notifyProcessor(job as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('does not call fetch when URL validation fails', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const job = makeJob({ webhookUrl: 'bad-url' });
    await expect(notifyProcessor(job as never)).rejects.toBeInstanceOf(ValidationError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws TransientError when fetch throws a network error', async () => {
    stubFetchNetworkError('ECONNREFUSED');
    const job = makeJob();
    await expect(notifyProcessor(job as never)).rejects.toBeInstanceOf(TransientError);
  });

  it('TransientError message contains the original network error message', async () => {
    stubFetchNetworkError('connection reset by peer');
    const job = makeJob();
    await expect(notifyProcessor(job as never)).rejects.toThrow(/connection reset by peer/i);
  });

  it('throws TransientError when response status is 500', async () => {
    stubFetchError(500, 'Internal Server Error');
    const job = makeJob();
    await expect(notifyProcessor(job as never)).rejects.toBeInstanceOf(TransientError);
  });

  it('throws TransientError when response status is 429', async () => {
    stubFetchError(429, 'Too Many Requests');
    const job = makeJob();
    await expect(notifyProcessor(job as never)).rejects.toBeInstanceOf(TransientError);
  });

  it('TransientError message includes the non-2xx status code', async () => {
    stubFetchError(503, 'Service Unavailable');
    const job = makeJob();
    await expect(notifyProcessor(job as never)).rejects.toThrow(/503/);
  });

  it('returns statusCode 200 and a non-negative responseTime on success', async () => {
    stubFetchOk(200);
    const job = makeJob();
    const result = await notifyProcessor(job as never);
    expect(result.statusCode).toBe(200);
    expect(typeof result.responseTime).toBe('number');
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
  });

  it('returns the actual status code from the response', async () => {
    stubFetchOk(201);
    const job = makeJob();
    const result = await notifyProcessor(job as never);
    expect(result.statusCode).toBe(201);
  });

  it('calls fetch with POST method', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);
    const job = makeJob();
    await notifyProcessor(job as never);
    expect(spy).toHaveBeenCalledWith(
      'https://hooks.example.com/notify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('calls fetch with application/json Content-Type header', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);
    const job = makeJob();
    await notifyProcessor(job as never);
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('calls job.log at least once on successful delivery', async () => {
    stubFetchOk();
    const job = makeJob();
    await notifyProcessor(job as never);
    expect(job.log).toHaveBeenCalled();
  });

  it('accepts https urls without throwing', async () => {
    stubFetchOk();
    const job = makeJob({ webhookUrl: 'https://secure.example.com/hook' });
    await expect(notifyProcessor(job as never)).resolves.not.toThrow();
  });

  it('accepts http urls without throwing', async () => {
    stubFetchOk();
    const job = makeJob({ webhookUrl: 'http://internal.example.com/hook' });
    await expect(notifyProcessor(job as never)).resolves.not.toThrow();
  });
});
