/**
 * Generic Zod validation middleware factory.
 *
 * Usage:
 *   router.post('/route', validateBody(mySchema), handler)
 *
 * On validation failure → 422 with structured errors array.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';

/**
 * Returns an Express middleware that validates `req.body` against the given
 * Zod schema.  On success it replaces `req.body` with the parsed (coerced)
 * value and calls `next()`.  On failure it responds with 422 and an errors array.
 */
export function validateBody<T>(schema: z.ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(422).json({ errors: result.error.issues });
      return;
    }
    req.body = result.data;
    next();
  };
}
