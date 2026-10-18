import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { LocationReading } from '@jax/shared';
import { hasMoved } from './moved';
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

// ── D73 / D77: reload the lists when you've moved ──

const movedListeners = new Set<() => void>();
/** Where Home / Places were last loaded (not just the latest reading for any request). */
let listPoint: LocationReading | undefined;
let watching = false;
let checking = false;
let watcher: Location.LocationSubscription | null = null;
/** D77: while the app is open, check where you are this often. */
export const WATCH_INTERVAL_MS = 30_000;

/** Home and Places call this after loading their first page. */
export function noteListLoad() {
  if (last) listPoint = last;
}

const movedFrom = (reading: LocationReading) => hasMoved(listPoint, reading);

function announceMove(reading: LocationReading) {
  last = reading;
  listPoint = reading; // until the reload records it, don't announce the same move again
  movedListeners.forEach((l) => l());
}

/** D73: on reopening the app, take a fresh fix and compare. */
async function checkMoved() {
  if (checking || !listPoint) return;
  checking = true;
  try {
    const now = await getFreshReading({ fresh: true });
    if (movedFrom(now)) announceMove(now);
  } catch {
    // No permission or no fix: keep what's on screen; the next request reports the problem.
  } finally {
    checking = false;
  }
}

/**
 * D77: while the app is open, the phone reports where you are about every 30 s (or after
 * about 25 m of movement). Moved more than MOVED_METERS from where the lists were loaded:
 * reload. Stops when the app is in the background, so it doesn't drain the battery.
 */
async function startWatch() {
  if (watcher) return;
  try {
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: WATCH_INTERVAL_MS,
        distanceInterval: 25,
      },
      (loc) => {
        const r = toReading(loc);
        if (movedFrom(r)) announceMove(r);
      },
    );
    if (AppState.currentState === 'active' && !watcher) watcher = sub;
    else sub.remove();
  } catch {
    // No permission: the screens show the location prompt instead.
  }
}

function stopWatch() {
  watcher?.remove();
  watcher = null;
}

function watchAppState() {
  if (watching) return;
  watching = true;
  let state = AppState.currentState;
  if (state === 'active') void startWatch();
  AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      if (state.match(/inactive|background/)) void checkMoved();
      void startWatch();
    } else {
      stopWatch();
    }
    state = next;
  });
}

/** Calls `onMoved` when you've moved since the lists loaded (reopened or while open). */
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
