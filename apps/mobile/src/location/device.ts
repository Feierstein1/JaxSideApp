import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { LocationReading } from '@jax/shared';
import { metersBetween } from './distance';
import { MOVED_METERS } from './moved';
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

// ── D73: check the location each time the app is opened ──

const movedListeners = new Set<() => void>();
let watching = false;
let checking = false;

/**
 * When the app comes back to the foreground, take a fresh fix and compare it with the one
 * the lists were last loaded with. Moved more than MOVED_METERS: tell the screens to reload.
 */
async function checkMoved() {
  if (checking || !last) return; // nothing loaded yet: the screens load on their own
  checking = true;
  try {
    const before = last;
    const now = await getFreshReading({ fresh: true });
    if (metersBetween(before, now) > MOVED_METERS) movedListeners.forEach((l) => l());
  } catch {
    // No permission or no fix: keep what's on screen; the next request reports the problem.
  } finally {
    checking = false;
  }
}

function watchAppState() {
  if (watching) return;
  watching = true;
  let state = AppState.currentState;
  AppState.addEventListener('change', (next) => {
    if (state.match(/inactive|background/) && next === 'active') void checkMoved();
    state = next;
  });
}

/** Calls `onMoved` when the app is reopened somewhere new (D73). */
export function useReloadWhenMoved(onMoved: () => void) {
  const ref = useRef(onMoved);
  ref.current = onMoved;
  useEffect(() => {
    watchAppState();
    const l = () => ref.current();
    movedListeners.add(l);
    return () => {
      movedListeners.delete(l);
    };
  }, []);
}
