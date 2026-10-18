import { metersBetween } from './distance';

/** D73: on opening the app, lists reload only if you've moved farther than this (≈ 55 yd). */
export const MOVED_METERS = 50;

type Fix = { latitude: number; longitude: number; accuracyMeters: number };

/**
 * D77: have you moved since the lists loaded? A fuzzy fix can look like a move, so the
 * distance must also beat the new fix's own accuracy.
 */
export function hasMoved(from: Fix | undefined, to: Fix): boolean {
  if (!from) return false;
  return metersBetween(from, to) > Math.max(MOVED_METERS, to.accuracyMeters);
}
