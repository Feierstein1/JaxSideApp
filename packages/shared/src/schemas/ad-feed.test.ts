import { describe, expect, it } from 'vitest';
import { adSlotPositions, adSlotsRequestSchema } from './ad-feed';

// D206: ads sit between posts at even, slightly varied gaps, continued across pages.

const slots = (from: number, to: number, seed = 'feed:2026-11-05') =>
  adSlotPositions({ from, to, first: 4, every: 8, seed });

describe('adSlotPositions', () => {
  it('first after about 4 posts, then about every 8, never at the top or back to back', () => {
    const s = slots(0, 120);
    expect(s[0]).toBeGreaterThanOrEqual(4);
    expect(s[0]).toBeLessThanOrEqual(5);
    for (let i = 1; i < s.length; i++) {
      const gap = s[i]! - s[i - 1]!;
      expect(gap).toBeGreaterThanOrEqual(7);
      expect(gap).toBeLessThanOrEqual(9);
    }
    expect(s.length).toBeGreaterThanOrEqual(13);
  });

  it('no ad in a list shorter than the first slot', () => {
    expect(slots(0, 3)).toEqual([]);
  });

  it('loading more continues the same pattern (no repeats, no restart)', () => {
    const all = slots(0, 90);
    expect([...slots(0, 30), ...slots(30, 60), ...slots(60, 90)]).toEqual(all);
  });

  it('the same seed gives the same slots; another seed may differ', () => {
    expect(slots(0, 60)).toEqual(slots(0, 60));
    const seeds = new Set(['a', 'b', 'c', 'd', 'e'].map((x) => JSON.stringify(slots(0, 60, x))));
    expect(seeds.size).toBeGreaterThan(1);
  });
});

describe('adSlotsRequestSchema', () => {
  const reading = { latitude: 30.3, longitude: -81.6, accuracyMeters: 10, timestamp: 1 };
  it('accepts a feed request and limits what the phone may ask for', () => {
    expect(
      adSlotsRequestSchema.safeParse({ reading, context: { kind: 'feed' }, count: 3 }).success,
    ).toBe(true);
    expect(
      adSlotsRequestSchema.safeParse({ reading, context: { kind: 'feed' }, count: 50 }).success,
    ).toBe(false);
    expect(
      adSlotsRequestSchema.safeParse({
        reading,
        context: { kind: 'feed' },
        count: 1,
        accountId: 'x',
      }).success,
    ).toBe(false);
  });
});
