import { describe, expect, it } from 'vitest';
import { adSlotPositions, adSlotsRequestSchema, discussionAdSlots, isLargeAd } from './ad-feed';

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

describe('D240 ad spacing in a discussion', () => {
  const slots = (n: number, complete = true) => discussionAdSlots({ from: 0, to: n, complete });

  it('follows the owner’s examples: under the only post, under the 2nd, then every 3 and the end', () => {
    expect(slots(0)).toEqual([]);
    expect(slots(1)).toEqual([1]);
    expect(slots(2)).toEqual([2]);
    expect(slots(3)).toEqual([2]);
    expect(slots(4)).toEqual([2, 4]);
    expect(slots(5)).toEqual([2, 5]);
    expect(slots(6)).toEqual([2, 5]);
    expect(slots(7)).toEqual([2, 5, 7]);
    expect(slots(8)).toEqual([2, 5, 8]);
    expect(slots(10)).toEqual([2, 5, 8, 10]);
  });

  it('never puts two ads in a row', () => {
    for (let n = 1; n <= 40; n++) {
      const s = slots(n);
      for (let i = 1; i < s.length; i++) expect(s[i]! - s[i - 1]!).toBeGreaterThanOrEqual(2);
    }
  });

  it('adds the end ad only when the list is complete, and never repeats earlier slots', () => {
    expect(slots(30, false)).toEqual([2, 5, 8, 11, 14, 17, 20, 23, 26, 29]);
    expect(discussionAdSlots({ from: 30, to: 34, complete: true })).toEqual([32, 34]);
    expect(discussionAdSlots({ from: 30, to: 31, complete: true })).toEqual([31]);
  });

  it('counts Feature ads and Post ads with a picture as large', () => {
    expect(isLargeAd({ template: 'FEATURE', hasImage: true })).toBe(true);
    expect(isLargeAd({ template: 'POST', hasImage: true })).toBe(true);
    expect(isLargeAd({ template: 'POST', hasImage: false })).toBe(false);
    expect(isLargeAd({ template: 'BANNER', hasImage: true })).toBe(false);
  });
});
