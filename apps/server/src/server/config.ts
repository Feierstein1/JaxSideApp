import { CONFIG_DEFAULTS, type ConfigKey } from '@jax/shared';
import { db } from './db';
import { logger } from './logger';

type ConfigValue<K extends ConfigKey> = (typeof CONFIG_DEFAULTS)[K] extends number
  ? number
  : (typeof CONFIG_DEFAULTS)[K];

const CACHE_TTL_MS = 30_000;
let cache: { values: Map<string, unknown>; loadedAt: number } | undefined;

async function load(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.values;
  const rows = await db.appConfiguration.findMany();
  cache = { values: new Map(rows.map((r) => [r.key, r.value])), loadedAt: Date.now() };
  return cache.values;
}

/** Drops the cached config (after an admin edit, and in tests). */
export function invalidateConfigCache(): void {
  cache = undefined;
}

/**
 * Server-authoritative config value (§7, §18). The database wins. If a row is missing
 * or has the wrong type, the shared default is used and a warning is logged.
 */
export async function getConfig<K extends ConfigKey>(key: K): Promise<ConfigValue<K>> {
  const fallback = CONFIG_DEFAULTS[key];
  const stored = (await load()).get(key);
  if (stored === undefined) {
    logger.warn({ key }, 'config key missing from AppConfiguration; using default');
    return fallback as ConfigValue<K>;
  }
  if (
    typeof stored !== typeof fallback ||
    (typeof stored === 'number' && !Number.isFinite(stored))
  ) {
    logger.warn({ key }, 'config value has wrong type; using default');
    return fallback as ConfigValue<K>;
  }
  return stored as ConfigValue<K>;
}
