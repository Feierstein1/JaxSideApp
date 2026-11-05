import * as SecureStore from 'expo-secure-store';

/**
 * D206: the ads this phone showed recently, so the same ad doesn't come back for a few
 * hours (`ads.cooldownHours`, from the server). Kept only on the phone; the server is told
 * the IDs with each request and never picks them. SecureStore values must stay small, so
 * only the newest few dozen are kept (more than anyone sees in a few hours).
 */
const KEY = 'jax.adsShown';
const KEEP = 30;
let cooldownMs = 3 * 3_600_000;
/** Ad ID → when it was shown (minutes since 1970, to keep the saved text short). */
let shown: Record<string, number> = {};
let loaded: Promise<void> | null = null;

const nowMin = () => Math.floor(Date.now() / 60_000);

function load() {
  loaded ??= SecureStore.getItemAsync(KEY)
    .then((raw) => {
      if (raw) shown = { ...(JSON.parse(raw) as Record<string, number>), ...shown };
    })
    .catch(() => undefined); // unreadable: start fresh
  return loaded;
}

function prune() {
  const cutoff = nowMin() - cooldownMs / 60_000;
  const fresh = Object.entries(shown)
    .filter(([, at]) => at > cutoff)
    .sort((a, b) => b[1] - a[1])
    .slice(0, KEEP);
  shown = Object.fromEntries(fresh);
}

export function setCooldownHours(hours: number) {
  cooldownMs = Math.max(0, hours) * 3_600_000;
}

/** IDs still cooling down (sent with each ad request). */
export async function recentlyShown(): Promise<string[]> {
  await load();
  prune();
  return Object.keys(shown);
}

export function markShown(adId: string) {
  shown[adId] = nowMin();
  prune();
  void SecureStore.setItemAsync(KEY, JSON.stringify(shown)).catch(() => undefined);
}
