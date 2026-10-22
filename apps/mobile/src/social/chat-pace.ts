/**
 * D114: how often an open chat checks for new messages. Every 3 seconds while the
 * conversation is active; after 2 minutes with nothing sent, received, typed or scrolled,
 * every 30 seconds (the same as the rest of the app), until something happens again.
 */
export const ACTIVE_POLL_MS = 3_000;
export const IDLE_POLL_MS = 30_000;
export const IDLE_AFTER_MS = 120_000;

/** Called every ACTIVE_POLL_MS: should this tick check the server? */
export function shouldPoll(now: number, lastActivity: number, lastPoll: number): boolean {
  const idle = now - lastActivity >= IDLE_AFTER_MS;
  // A little slack so a tick that lands a few ms early still counts.
  return now - lastPoll >= (idle ? IDLE_POLL_MS : ACTIVE_POLL_MS) - 250;
}
