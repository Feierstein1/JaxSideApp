import { useSyncExternalStore } from 'react';

/**
 * D130: polls you voted in during this session. Home hides them right away (without
 * waiting for the server) and shows a short "Thanks for voting" in their place.
 */
const voted = new Set<string>();
/** Polls whose thank-you Home hasn't shown yet. */
const thanks = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

export function markVoted(pollId: string) {
  voted.add(pollId);
  thanks.add(pollId);
  version++;
  listeners.forEach((l) => l());
}

export const hasVoted = (pollId: string) => voted.has(pollId);

/** True once after a vote: Home shows its thank-you, then it's used up. */
export function takeThanks() {
  const any = thanks.size > 0;
  thanks.clear();
  return any;
}

/** Re-renders when a vote is recorded. */
export function useVotedVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}
