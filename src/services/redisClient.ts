import IORedis, { type RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

let redisInstance: IORedis | null = null;

/**
 * builds the ioredis connection options from environment variables.
 *
 * - maxRetriesPerRequest: null is required by bullmq for blocking operations
 * - lazyConnect: true defers connection until first command or explicit .connect()
 * - enableReadyCheck: false skips the INFO check on startup (bullmq requirement)
 * - retryStrategy: exponential backoff, min 1s, max 20s
 */
function getRedisConfig(): RedisOptions {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const useTls = process.env['REDIS_TLS'] === 'true';

  const parsed = new URL(url);

  const config: RedisOptions = {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableReadyCheck: false,
    retryStrategy(times: number): number {
      const delay = Math.max(Math.min(Math.exp(times) * 100, 20000), 1000);
      logger.warn({ attempt: times, delayMs: delay }, 'redis reconnecting');
      return delay;
    },
  };

  if (useTls) {
    config.tls = {};
  }

  return config;
}

/**
 * returns the singleton ioredis client.
 * creates the instance on first call using REDIS_URL from env.
 *
 * @returns the shared ioredis instance
 */
export function getRedisClient(): IORedis {
  if (!redisInstance) {
    redisInstance = new IORedis(getRedisConfig());

    redisInstance.on('error', (err: Error) => {
      logger.error({ err }, 'redis connection error');
    });

    redisInstance.on('connect', () => {
      logger.info('redis connected');
    });

    redisInstance.on('ready', () => {
      logger.info('redis ready');
    });

    redisInstance.on('close', () => {
      logger.warn('redis connection closed');
    });
  }
  return redisInstance;
}

/**
 * resets the singleton - intended for test teardown only.
 * do not call in production code.
 */
export function _resetRedisClient(): void {
  redisInstance = null;
}
