/**
 * D259: a small in-memory cache for lists that rarely change between taps (events, friends,
 * blocked people, favorites, topics). Kept only while the app is open (never saved to disk, so
 * nothing about a person lingers on the phone), emptied on sign-in and sign-out, and a change
 * the person makes themselves (follow, unfriend, block...) calls `invalidate` so they never see
 * their own change missing. The server stays the authority: a pull-to-refresh or a retry
 * passes `force`, and nothing here is used for anything that needs to be live (feeds, chat,
 * badges).
 */
interface Entry {
  at: number;
  value: unknown;
}

const MAX_ENTRIES = 80;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
/** Bumped by invalidate/clear so a request that started before one can't put old data back. */
let epoch = 0;

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;

/**
 * The cached answer for `key` when it is younger than `ttlMs`; otherwise runs `load` (one at a
 * time per key) and keeps the result. Failures are never cached.
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  force = false,
): Promise<T> {
  const hit = store.get(key);
  if (!force && hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T);
  const running = inflight.get(key);
  if (!force && running) return running as Promise<T>;
  const startedIn = epoch;
  const p = load()
    .then((value) => {
      if (startedIn === epoch) {
        store.delete(key); // re-insert so the oldest entry is the first in line to go
        store.set(key, { at: Date.now(), value });
        if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
      }
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** Forget every entry whose key starts with `prefix` (a change was made, so reload next time). */
export function invalidate(prefix: string) {
  epoch++;
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k);
}

/** Forget everything (signing in or out: the next person must never see this one's lists). */
export function clearCache() {
  epoch++;
  store.clear();
  inflight.clear();
}
