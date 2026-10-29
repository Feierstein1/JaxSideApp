import { useEffect, useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

/**
 * D162: things closed with × to make room: the poll on Home and place votes on Places. Each
 * is remembered by its ID on this phone, so it stays hidden until something new shows up
 * (a new poll, a new place to verify). Kept short: only the latest IDs matter.
 */
const KEY = 'jax.dismissed';
const KEEP = 60;
let ids: string[] = [];
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

async function load() {
  if (loaded) return;
  loaded = true;
  const raw = await SecureStore.getItemAsync(KEY).catch(() => null);
  try {
    ids = [...new Set([...(raw ? (JSON.parse(raw) as string[]) : []), ...ids])].slice(-KEEP);
  } catch {
    // unreadable: start fresh
  }
  emit();
}

export const isDismissed = (id: string) => ids.includes(id);

export function dismiss(newIds: string[]) {
  ids = [...ids.filter((i) => !newIds.includes(i)), ...newIds].slice(-KEEP);
  emit();
  void SecureStore.setItemAsync(KEY, JSON.stringify(ids)).catch(() => undefined);
}

/** Re-renders when something is dismissed (or the saved list finishes loading). */
export function useDismissed() {
  useEffect(() => void load(), []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}
