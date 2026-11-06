/** D202: away from the app this long, it comes back on the list screens with fresh data. */
export const IDLE_RESET_MS = 20 * 60_000;

/** Screens where a half-finished job (a draft, a chat) must not be thrown away. */
const KEEP = /compose|messages|account|notifications|owner|suggest|friends/;

export const shouldReset = (awayMs: number, pathname: string) =>
  awayMs >= IDLE_RESET_MS && !KEEP.test(pathname);
