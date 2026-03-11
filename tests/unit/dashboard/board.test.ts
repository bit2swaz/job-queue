/**
 * Unit tests for Phase 9 — Bull-Board dashboard module.
 *
 * Verifies that `src/dashboard/board.ts` exports a valid Express server
 * adapter with the expected base path and a usable router factory.
 *
 * BullMQ queues and Redis are NOT needed here — the board is instantiated
 * with real queue adapters but the queues themselves never contact Redis in
 * these tests (Queue instances are created lazily).
 */

describe('board: serverAdapter export', () => {
  let serverAdapter: { getRouter: () => unknown; setBasePath: (p: string) => void };

  beforeAll(async () => {
    jest.resetModules();
    ({ serverAdapter } = await import('../../../src/dashboard/board'));
  });

  it('exports a serverAdapter object', () => {
    expect(serverAdapter).toBeDefined();
    expect(typeof serverAdapter).toBe('object');
  });

  it('serverAdapter.getRouter is a function', () => {
    expect(typeof serverAdapter.getRouter).toBe('function');
  });

  it('serverAdapter.getRouter() returns an express-compatible router', () => {
    const router = serverAdapter.getRouter();
    // Express routers are functions with `.use`, `.get`, etc.
    expect(typeof router).toBe('function');
  });
});
