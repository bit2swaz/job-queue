import { reportProcessor, type ReportJobData } from '../../../src/processors/reportProcessor';
import { ValidationError } from '../../../src/processors/errors';

type MockJob = {
  data: ReportJobData;
  log: jest.Mock;
  updateProgress: jest.Mock;
};

function makeJob(data: Partial<ReportJobData> = {}): MockJob {
  return {
    data: {
      reportType: 'summary',
      userId: 'user-123',
      format: 'pdf',
      ...data,
    },
    log: jest.fn().mockResolvedValue(0),
    updateProgress: jest.fn().mockResolvedValue(undefined),
  };
}

describe('reportProcessor', () => {
  it('throws ValidationError for an unrecognised reportType', async () => {
    const job = makeJob({ reportType: 'unrecognised-type' });
    await expect(reportProcessor(job as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('ValidationError message includes the offending reportType value', async () => {
    const job = makeJob({ reportType: 'bogus' });
    await expect(reportProcessor(job as never)).rejects.toThrow(/bogus/i);
  });

  it('accepts "summary" without throwing', async () => {
    const job = makeJob({ reportType: 'summary' });
    await expect(reportProcessor(job as never)).resolves.not.toThrow();
  });

  it('accepts "detailed" without throwing', async () => {
    const job = makeJob({ reportType: 'detailed' });
    await expect(reportProcessor(job as never)).resolves.not.toThrow();
  });

  it('accepts "audit" without throwing', async () => {
    const job = makeJob({ reportType: 'audit' });
    await expect(reportProcessor(job as never)).resolves.not.toThrow();
  });

  it('accepts "analytics" without throwing', async () => {
    const job = makeJob({ reportType: 'analytics' });
    await expect(reportProcessor(job as never)).resolves.not.toThrow();
  });

  it('calls updateProgress with 0, 25, 75, 100 in that order', async () => {
    const job = makeJob();
    await reportProcessor(job as never);
    const progressValues = job.updateProgress.mock.calls.map((c: unknown[]) => c[0]);
    expect(progressValues).toEqual([0, 25, 75, 100]);
  });

  it('calls job.log exactly twice on success', async () => {
    const job = makeJob();
    await reportProcessor(job as never);
    expect(job.log).toHaveBeenCalledTimes(2);
  });

  it('returns a reportUrl string that contains the userId', async () => {
    const job = makeJob({ userId: 'user-456' });
    const result = await reportProcessor(job as never);
    expect(result.reportUrl).toContain('user-456');
  });

  it('returns a reportUrl string that contains the reportType', async () => {
    const job = makeJob({ reportType: 'audit' });
    const result = await reportProcessor(job as never);
    expect(result.reportUrl).toContain('audit');
  });

  it('returns a reportUrl with the correct file extension for pdf format', async () => {
    const job = makeJob({ format: 'pdf' });
    const result = await reportProcessor(job as never);
    expect(result.reportUrl).toContain('.pdf');
  });

  it('returns a reportUrl with the correct file extension for csv format', async () => {
    const job = makeJob({ format: 'csv' });
    const result = await reportProcessor(job as never);
    expect(result.reportUrl).toContain('.csv');
  });

  it('returns a generatedAt timestamp close to Date.now()', async () => {
    const before = Date.now();
    const job = makeJob();
    const result = await reportProcessor(job as never);
    expect(result.generatedAt).toBeGreaterThanOrEqual(before);
    expect(result.generatedAt).toBeLessThanOrEqual(Date.now() + 50);
  });
});
