import * as Location from 'expo-location';
import type { LocationReading } from '@jax/shared';
import { toReading } from './reading';

/** Reuse a reading for this long (the server accepts up to 60 s), so typing a search isn't slow. */
const REUSE_MS = 30_000;
let last: LocationReading | undefined;

/**
 * A recent GPS reading for a location-restricted request. Permission must already be
 * granted; no prompt is shown here. Pass `fresh` for actions that must use a brand-new fix.
 */
export async function getFreshReading(opts: { fresh?: boolean } = {}): Promise<LocationReading> {
  if (!opts.fresh && last && Date.now() - last.timestamp < REUSE_MS) return last;
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  last = toReading(loc);
  return last;
}
