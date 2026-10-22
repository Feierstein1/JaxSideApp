import { describe, expect, it } from 'vitest';
import { ACTIVE_POLL_MS, IDLE_AFTER_MS, IDLE_POLL_MS, shouldPoll } from './chat-pace';

// D114: an open chat checks every 3 s while active, every 30 s after 2 quiet minutes.
describe('chat pace', () => {
  const t0 = 1_000_000;

  it('checks every 3 seconds while the conversation is active', () => {
    expect(shouldPoll(t0 + ACTIVE_POLL_MS, t0, t0)).toBe(true);
    expect(shouldPoll(t0 + 1_000, t0, t0)).toBe(false);
  });

  it('after 2 quiet minutes, only every 30 seconds', () => {
    const now = t0 + IDLE_AFTER_MS + 10_000;
    expect(shouldPoll(now, t0, now - ACTIVE_POLL_MS)).toBe(false);
    expect(shouldPoll(now, t0, now - 20_000)).toBe(false);
    expect(shouldPoll(now, t0, now - IDLE_POLL_MS)).toBe(true);
  });

  it('back to every 3 seconds as soon as something happens', () => {
    const now = t0 + IDLE_AFTER_MS + 10_000;
    const justNow = now - 500; // a message, typing or a scroll
    expect(shouldPoll(now, justNow, now - ACTIVE_POLL_MS)).toBe(true);
  });
});
