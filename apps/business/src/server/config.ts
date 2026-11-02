import { CONFIG_DEFAULTS, type ConfigKey } from '@jax/shared';
import { db } from './db';

/**
 * Admin settings (`AppConfiguration`, shared database) with the shared defaults, the same
 * way the app server reads them, so both apps follow one set of limits.
 */

type ConfigValue<K extends ConfigKey> = (typeof CONFIG_DEFAULTS)[K] extends number
  ? number
  : (typeof CONFIG_DEFAULTS)[K] extends boolean
    ? boolean
    : (typeof CONFIG_DEFAULTS)[K];

const CACHE_TTL_MS = 30_000;
let cache: { values: Map<string, unknown>; loadedAt: number } | undefined;

async function load(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.values;
  const rows = await db.appConfiguration.findMany();
  cache = { values: new Map(rows.map((r) => [r.key, r.value])), loadedAt: Date.now() };
  return cache.values;
}

export function invalidateConfigCache(): void {
  cache = undefined;
}

export async function getConfig<K extends ConfigKey>(key: K): Promise<ConfigValue<K>> {
  const fallback = CONFIG_DEFAULTS[key];
  const stored = (await load()).get(key);
  if (
    stored === undefined ||
    typeof stored !== typeof fallback ||
    (typeof stored === 'number' && !Number.isFinite(stored))
  ) {
    return fallback as ConfigValue<K>;
  }
  return stored as ConfigValue<K>;
}
