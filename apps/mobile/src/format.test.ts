import { describe, expect, it } from 'vitest';
import { categoryLabel, formatDistance, plural, timeAgo } from './format';

describe('formatDistance', () => {
  it.each([
    [0, '10 ft'],
    [70, '230 ft'],
    [160, '520 ft'], // 0.099 mi: still feet
    [170, '0.1 mi'], // just over 0.1 mi: miles
    [735, '0.5 mi'],
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
