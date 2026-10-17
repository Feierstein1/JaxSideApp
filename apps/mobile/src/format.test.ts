import { describe, expect, it } from 'vitest';
import { categoryLabel, formatDistance, plural, postTime, timeAgo } from './format';

describe('formatDistance (D71)', () => {
  it.each([
    [0, '10 ft'],
    [70, '230 ft'],
    [90, '300 ft'], // 98 yd: still feet
    [250, '270 yd'],
    [483, '530 yd'], // 0.3 mi
    [1_500, '1640 yd'],
    [3_400, '2.1 mi'],
    [29_000, '18 mi'],
  ])('%d m → %s', (m, out) => {
    expect(formatDistance(m)).toBe(out);
  });
});

describe('categoryLabel', () => {
  it.each([
    ['fast_food', 'Fast food'],
    ['cafe', 'Cafe'],
    ['car_dealer', 'Car dealer'],
  ])('%s → %s', (c, out) => {
    expect(categoryLabel(c)).toBe(out);
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  it.each([
    ['2026-10-15T11:59:30Z', 'now'],
    ['2026-10-15T11:55:00Z', '5m'],
    ['2026-10-15T09:00:00Z', '3h'],
    ['2026-10-13T12:00:00Z', '2d'],
    ['2026-10-01T12:00:00Z', 'Oct 1'],
  ])('%s → %s', (iso, out) => {
    expect(timeAgo(iso, now)).toBe(out);
  });
});

describe('plural', () => {
  it('handles one and many', () => {
    expect(plural(1, 'post')).toBe('1 post');
    expect(plural(0, 'post')).toBe('0 posts');
    expect(plural(12, 'comment')).toBe('12 comments');
  });
});

describe('postTime (D69)', () => {
  const now = Date.parse('2026-10-16T18:00:00Z');
  const ago = (s: number) => new Date(now - s * 1000).toISOString();
  it.each([
    [10, 'just now'],
    [5 * 60, '5 min ago'],
    [3 * 3600, '3 hr ago'],
    [26 * 3600, '1 day ago'],
    [2.5 * 86_400, '2 days ago'],
  ])('%i s ago → %s', (s, out) => {
    expect(postTime(ago(s), now)).toBe(out);
  });
  it('after 3 days shows the date', () => {
    expect(postTime('2026-10-01T15:00:00Z', now)).toBe('Oct 1');
    expect(postTime('2025-12-24T15:00:00Z', now)).toBe('Dec 24, 2025');
  });
});
