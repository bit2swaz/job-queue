/**
 * JWT authentication middleware.
 *
 * Reads the `Authorization: Bearer <token>` header, verifies the token with
 * JWT_SECRET, and attaches the decoded payload to `req.user`.
 *
 * - Missing / malformed header  → 401
 * - Invalid / expired token     → 403
 * - Valid token                 → next()
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

/** Shape of the decoded JWT payload attached to every authenticated request. */
export interface JwtPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

// Extend Express Request so downstream handlers have type-safe access.
declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload;
  }
}

export function jwtMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "
  const secret = process.env['JWT_SECRET'] ?? '';

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn({ err }, 'jwt verification failed');
    res.status(403).json({ error: 'invalid or expired token' });
  }
}
