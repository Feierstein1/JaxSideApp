import { useSyncExternalStore } from 'react';

/**
 * D267: the loading screen stays up until the first screen has what it needs (Home's first
 * posts), not just until sign-in is checked. `markBootReady()` is called by whatever screen
 * finishes first loading (or can't, e.g. the location screen); `resetBoot()` on sign-out so the
 * next sign-in waits again. `retryBoot()` re-mounts the app after a timeout.
 */
export const BOOT_TIMEOUT_MS = 15_000;

interface Boot {
  ready: boolean;
  attempt: number;
}
let boot: Boot = { ready: false, attempt: 0 };
const listeners = new Set<() => void>();
const set = (next: Boot) => {
  boot = next;
  listeners.forEach((l) => l());
};

export const markBootReady = () => {
  if (!boot.ready) set({ ...boot, ready: true });
};
export const resetBoot = () => {
  if (boot.ready) set({ ...boot, ready: false });
};
export const retryBoot = () => set({ ready: false, attempt: boot.attempt + 1 });

export function useBoot(): Boot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => boot,
  );
}
