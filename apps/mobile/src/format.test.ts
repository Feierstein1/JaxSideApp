import { describe, expect, it } from 'vitest';
import { categoryLabel, formatDistance } from './format';

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
