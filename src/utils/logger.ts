import pino from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';

/**
 * singleton pino logger for the entire application.
 *
 * log levels: error, warn, info, debug
 * structured fields: jobId, queue, duration, error
 *
 * in production: outputs newline-delimited json (ndjson)
 * in development: outputs pretty-printed human-readable logs
 */
export const logger = pino(
  {
    level: process.env['LOG_LEVEL'] ?? 'info',
    base: {
      pid: process.pid,
      env: process.env['NODE_ENV'] ?? 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      })
    : undefined,
);

export type Logger = typeof logger;
