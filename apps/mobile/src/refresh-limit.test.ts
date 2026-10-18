import { describe, expect, it } from 'vitest';
import { createRefreshLimiter, REFRESH_PER_MINUTE } from './refresh-limit';

describe('refresh limit (D74)', () => {
  it('allows 30 a minute, then says how long to wait, then allows again', () => {
    let t = 0;
    const l = createRefreshLimiter(REFRESH_PER_MINUTE, () => t);
    for (let i = 0; i < 30; i++) expect(l.tap()).toBe(0);
    t = 20_000;
    expect(l.tap()).toBe(40);
    t = 60_000;
    expect(l.tap()).toBe(0);
  });
});
