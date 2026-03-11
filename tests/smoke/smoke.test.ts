/**
 * smoke test - confirms jest is configured correctly.
 * this is the phase 0 tdd gate.
 */
describe('smoke', () => {
  it('jest is working', () => {
    expect(1).toBe(1);
  });

  it('typescript types are valid', () => {
    const value: string = 'hello';
    expect(typeof value).toBe('string');
  });

  it('async/await works', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
