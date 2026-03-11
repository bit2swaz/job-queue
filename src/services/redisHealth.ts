import { getRedisClient } from './redisClient';
import { logger } from '../utils/logger';

/**
 * sends a PING to redis and returns true if it responds.
 *
 * @returns true if redis responds, false on any error
 */
export async function pingRedis(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const response = await redis.ping();
    return response === 'PONG';
  } catch (err) {
    logger.error({ err }, 'redis ping failed');
    return false;
  }
}

/**
 * fetches the redis INFO output and parses it into a key/value record.
 *
 * @returns parsed info fields as a flat Record<string, string>
 */
export async function getRedisInfo(): Promise<Record<string, string>> {
  const redis = getRedisClient();
  const raw = await redis.info();
  return raw
    .split('\n')
    .filter((line) => line.includes(':'))
    .reduce<Record<string, string>>((acc, line) => {
      const colonIdx = line.indexOf(':');
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

/**
 * gracefully closes the redis connection.
 * call this during application shutdown and in test teardown.
 */
export async function closeRedis(): Promise<void> {
  const redis = getRedisClient();
  await redis.quit();
  logger.info('redis connection closed');
}
