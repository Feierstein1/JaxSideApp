import { APP_TIME_ZONE } from './constants';

/** Calendar year of `now` in the app timezone (D22), so the cutoff flips at local midnight Jan 1. */
export function currentYearInAppTimeZone(now: Date = new Date()): number {
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
  }).format(now);
  return Number(year);
}

/** Latest birth year allowed to register (§4.2). */
export function maxEligibleBirthYear(currentYear: number, offset: number): number {
  return currentYear - offset;
}

/**
 * Conservative 18+ screen (§4.2): birthYear <= currentYear - offset.
 * This is a limited screen, not age verification.
 */
export function isBirthYearEligible(
  birthYear: number,
  currentYear: number,
  offset: number,
): boolean {
  return birthYear <= maxEligibleBirthYear(currentYear, offset);
}
