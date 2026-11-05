import { AppState } from 'react-native';
import { CONFIG_DEFAULTS, type AdContext, type AdLayout, type AdsResponse } from '@jax/shared';
import { api } from '@/api';
import { getFreshReading } from '@/location/device';
import { markShown, recentlyShown, setCooldownHours } from './shown';

/**
 * D206 / B3.6: ads in the feeds. The server picks the ads; the phone asks for as many as the
 * page has slots, places them, and reports which were seen (half on screen for a second).
 */

/** The admin's spacing, from the last answer (defaults until the first one). */
let layout: AdLayout = {
  first: CONFIG_DEFAULTS['ads.firstSlot'],
  every: CONFIG_DEFAULTS['ads.every'],
  cooldownHours: CONFIG_DEFAULTS['ads.cooldownHours'],
};
export const adLayout = () => layout;

export async function fetchAds(context: AdContext, count: number) {
  const reading = await getFreshReading();
  const res = await api.post<AdsResponse>('/api/v1/ads', {
    reading,
    context,
    count,
    seen: await recentlyShown(),
  });
  if (res.layout) {
    layout = res.layout;
    setCooldownHours(res.layout.cooldownHours);
  }
  return res.ads;
}

export function setAdInterest(adId: string, choice: 'INTERESTED' | 'NOT_INTERESTED' | null) {
  return api.post<{ choice: typeof choice }>(`/api/v1/ads/${adId}/interest`, { choice });
}

// ── Views: collected and sent in batches (every few seconds, and when the app goes away) ──

const VIEWS_MAX = 50;
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  if (!pending.size) return;
  const adIds = [...pending].slice(0, VIEWS_MAX);
  pending = new Set([...pending].slice(VIEWS_MAX));
  // A lost batch only means a few uncounted views; never bother the person about it.
  await api.post('/api/v1/ads/views', { adIds }).catch(() => undefined);
  if (pending.size) timer = setTimeout(() => void flush(), 5_000);
}

/** An ad was on screen (half of it, for a second): count it and start its cooldown. */
export function adSeen(adId: string) {
  markShown(adId);
  pending.add(adId);
  timer ??= setTimeout(() => void flush(), 5_000);
}

AppState.addEventListener('change', (s) => {
  if (s !== 'active') void flush();
});
