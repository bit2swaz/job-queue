/**
 * Token issuance service.
 *
 * Provides a thin wrapper around jsonwebtoken for signing JWTs.
 * Used by the POST /auth/token route.
 */
import jwt from 'jsonwebtoken';

/** Token lifetime — 24 hours. */
const TOKEN_TTL = '24h';

/**
 * Issues a signed JWT for the given subject and role.
 *
 * @param sub   user identifier (e.g. user ID or email)
 * @param role  authorization role (e.g. 'admin', 'operator', 'viewer')
 * @returns     signed JWT string
 */
export function issueToken(sub: string, role: string): string {
  const secret = process.env['JWT_SECRET'] ?? '';
  return jwt.sign({ sub, role }, secret, { expiresIn: TOKEN_TTL });
}
