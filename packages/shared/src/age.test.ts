import { describe, expect, it } from 'vitest';
import { currentYearInAppTimeZone, isBirthYearEligible } from './age';

describe('isBirthYearEligible (offset 19)', () => {
  it('matches the §4.2 example: in 2026, 2007 or earlier', () => {
    expect(isBirthYearEligible(2007, 2026, 19)).toBe(true);
    expect(isBirthYearEligible(2008, 2026, 19)).toBe(false);
  });

  it('respects a configured offset', () => {
    expect(isBirthYearEligible(2008, 2026, 18)).toBe(true);
  });
});

describe('currentYearInAppTimeZone (America/New_York)', () => {
  it('is still the old year at 23:59 Dec 31 Eastern, even though UTC is already Jan 1', () => {
    // 2026-12-31 23:59 EST == 2027-01-01 04:59 UTC
    expect(currentYearInAppTimeZone(new Date('2027-01-01T04:59:00Z'))).toBe(2026);
  });

  it('flips at 00:00 Jan 1 Eastern', () => {
    // 2027-01-01 00:00 EST == 2027-01-01 05:00 UTC
    expect(currentYearInAppTimeZone(new Date('2027-01-01T05:00:00Z'))).toBe(2027);
  });

  it('2008 becomes eligible exactly at the Eastern year flip', () => {
    const before = currentYearInAppTimeZone(new Date('2027-01-01T04:59:59Z'));
    const after = currentYearInAppTimeZone(new Date('2027-01-01T05:00:00Z'));
    expect(isBirthYearEligible(2008, before, 19)).toBe(false);
    expect(isBirthYearEligible(2008, after, 19)).toBe(true);
  });
});
