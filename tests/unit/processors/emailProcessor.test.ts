import { emailProcessor, type EmailJobData } from '../../../src/processors/emailProcessor';
import { ValidationError } from '../../../src/processors/errors';

type MockJob = {
  data: EmailJobData;
  log: jest.Mock;
  updateProgress: jest.Mock;
};

function makeJob(data: Partial<EmailJobData> = {}): MockJob {
  return {
    data: {
      to: 'recipient@example.com',
      subject: 'hello world',
      body: 'this is the email body',
      ...data,
    },
    log: jest.fn().mockResolvedValue(0),
    updateProgress: jest.fn().mockResolvedValue(undefined),
  };
}

describe('emailProcessor', () => {
  it('throws ValidationError when "to" is empty', async () => {
    const job = makeJob({ to: '' });
    await expect(emailProcessor(job as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when "to" is whitespace only', async () => {
    const job = makeJob({ to: '   ' });
    await expect(emailProcessor(job as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when "subject" is empty', async () => {
    const job = makeJob({ subject: '' });
    await expect(emailProcessor(job as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when "body" is empty', async () => {
    const job = makeJob({ body: '' });
    await expect(emailProcessor(job as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('ValidationError message names the missing field', async () => {
    const job = makeJob({ to: '' });
    await expect(emailProcessor(job as never)).rejects.toThrow(/to/i);
  });

  it('calls updateProgress with 0, 50, 100 in that order', async () => {
    const job = makeJob();
    await emailProcessor(job as never);
    const progressValues = job.updateProgress.mock.calls.map((c: unknown[]) => c[0]);
    expect(progressValues).toEqual([0, 50, 100]);
  });

  it('calls job.log exactly twice on success', async () => {
    const job = makeJob();
    await emailProcessor(job as never);
    expect(job.log).toHaveBeenCalledTimes(2);
  });

  it('returns a non-empty messageId string', async () => {
    const job = makeJob();
    const result = await emailProcessor(job as never);
    expect(typeof result.messageId).toBe('string');
    expect(result.messageId.length).toBeGreaterThan(0);
  });

  it('returns a sentAt number close to Date.now()', async () => {
    const before = Date.now();
    const job = makeJob();
    const result = await emailProcessor(job as never);
    expect(result.sentAt).toBeGreaterThanOrEqual(before);
    expect(result.sentAt).toBeLessThanOrEqual(Date.now() + 50);
  });

  it('succeeds with an optional templateId present', async () => {
    const job = makeJob({ templateId: 'welcome-v2' });
    const result = await emailProcessor(job as never);
    expect(result.messageId).toBeTruthy();
  });

  it('does not throw when all required fields are valid', async () => {
    const job = makeJob();
    await expect(emailProcessor(job as never)).resolves.not.toThrow();
  });
});
