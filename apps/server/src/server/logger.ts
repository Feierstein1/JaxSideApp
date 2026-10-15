import pino, { type DestinationStream, type Logger } from 'pino';

/**
 * Fields that must never reach logs in clear text (§18: logs without unnecessary personal data).
 * Paths cover top-level objects and one level of nesting (e.g. `req.headers.authorization`).
 */
const SENSITIVE_KEYS = [
  'password',
  'newPassword',
  'passwordHash',
  'email',
  'birthYear',
  'emailEnc',
  'newEmailEnc',
  'dekWrapped',
  'legalHoldNote',
  'token',
  'sessionToken',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'ip',
];

export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]);

export function createLogger(level: string = 'info', destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'jax-server' },
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

export const logger = createLogger(process.env.LOG_LEVEL ?? 'info');
