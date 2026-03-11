/**
 * Unit tests for src/auth/jwtMiddleware.ts
 *
 * Uses a real express app + supertest so we exercise the actual middleware
 * lifecycle (next(), res.json()).  jsonwebtoken itself is NOT mocked — we sign
 * real tokens with a known test secret so tests remain deterministic.
 */
import request from 'supertest';
import express, { type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-for-unit';

// ── module under test ────────────────────────────────────────────────────────
// imported AFTER the env var is set so jwtMiddleware reads the right secret
process.env['JWT_SECRET'] = TEST_SECRET;

import { jwtMiddleware } from '@auth/jwtMiddleware';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal express app with a protected route */
function makeApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.get('/protected', jwtMiddleware, (_req: Request, res: Response) => {
    res.status(200).json({ user: (_req as Request & { user?: unknown }).user });
  });
  return app;
}

function signToken(
  payload: Record<string, unknown>,
  secret = TEST_SECRET,
  opts?: jwt.SignOptions,
): string {
  return jwt.sign(payload, secret, { expiresIn: '1h', ...opts });
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('jwtMiddleware', () => {
  const app = makeApp();

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  it('returns 403 when token is signed with the wrong secret', async () => {
    const token = signToken({ sub: 'user1', role: 'admin' }, 'wrong-secret');
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it('returns 403 when token is expired', async () => {
    const token = signToken({ sub: 'user1', role: 'admin' }, TEST_SECRET, {
      expiresIn: '-1s',
    });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when token is malformed', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(403);
  });

  it('attaches req.user and calls next() when token is valid', async () => {
    const token = signToken({ sub: 'user42', role: 'operator' });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ sub: 'user42', role: 'operator' });
  });

  it('req.user contains iat and exp fields', async () => {
    const token = signToken({ sub: 'user99', role: 'viewer' });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('iat');
    expect(res.body.user).toHaveProperty('exp');
  });
});
