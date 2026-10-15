/** Runs once at server boot. Fails fast on a bad environment (P1.6). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getEnv } = await import('./server/env');
  const { logger } = await import('./server/logger');
  const env = getEnv();
  logger.info({ nodeEnv: env.NODE_ENV }, 'environment validated');
}
