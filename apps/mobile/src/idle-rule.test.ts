import { describe, expect, it } from 'vitest';
import { IDLE_RESET_MS, shouldReset } from './idle-rule';

describe('idle reset (D202)', () => {
  it('resets after 20 minutes away', () => {
    expect(shouldReset(IDLE_RESET_MS, '/places/abc')).toBe(true);
    expect(shouldReset(IDLE_RESET_MS - 1, '/places/abc')).toBe(false);
  });
  it('leaves drafts, chats and account pages alone', () => {
    for (const p of ['/places/compose', '/messages/ann', '/account', '/notifications'])
      expect(shouldReset(IDLE_RESET_MS * 3, p)).toBe(false);
  });
});
