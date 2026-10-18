/**
 * D74: at most 30 taps of the refresh button per minute (across Home and Places). The server
 * also caps feed and search requests (60/min each), so this is a courtesy limit that stops
 * accidental hammering before it reaches the server.
 */
export const REFRESH_PER_MINUTE = 30;
const WINDOW_MS = 60_000;

export function createRefreshLimiter(max = REFRESH_PER_MINUTE, now = () => Date.now()) {
  const taps: number[] = [];
  return {
    /** Records a tap; returns seconds to wait if over the limit, otherwise 0. */
    tap(): number {
      const t = now();
      while (taps.length && t - taps[0]! >= WINDOW_MS) taps.shift();
      if (taps.length >= max) return Math.ceil((WINDOW_MS - (t - taps[0]!)) / 1000);
      taps.push(t);
      return 0;
    },
  };
}

export const refreshLimiter = createRefreshLimiter();
