import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dateLabel,
  isValidDate,
  localDate,
  localTime,
  localToUtc,
  monthGrid,
  repeatWeekly,
  sessionInstants,
  timeLabel,
} from './event-time';
import { eventInputSchema } from './schemas/events';

describe('D230 event times (Jacksonville)', () => {
  it('turns a summer and a winter evening into the right instants', () => {
    expect(localToUtc('2026-07-04', '20:00').toISOString()).toBe('2026-07-05T00:00:00.000Z');
    expect(localToUtc('2026-12-25', '10:00').toISOString()).toBe('2026-12-25T15:00:00.000Z');
  });

  it('handles both daylight-saving changes', () => {
    // 2026-03-08: 2:00 jumps to 3:00. 1:30 is EST, 3:30 is EDT; 2:30 doesn't exist.
    expect(localToUtc('2026-03-08', '01:30').toISOString()).toBe('2026-03-08T06:30:00.000Z');
    expect(localToUtc('2026-03-08', '03:30').toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(localTime(localToUtc('2026-03-08', '02:30'))).toBe('03:30');
    // 2026-11-01: 2:00 falls back to 1:00. Noon that day is EST.
    expect(localToUtc('2026-11-01', '12:00').toISOString()).toBe('2026-11-01T17:00:00.000Z');
  });

  it('reads instants back as Jacksonville dates and times, around midnight too', () => {
    expect(localDate('2026-11-15T04:30:00Z')).toBe('2026-11-14');
    expect(localTime('2026-11-15T04:30:00Z')).toBe('23:30');
    expect(localDate('2026-11-15T05:00:00Z')).toBe('2026-11-15');
    expect(localTime('2026-11-15T05:00:00Z')).toBe('00:00');
  });

  it('runs a late show past midnight', () => {
    const s = sessionInstants({ date: '2026-11-14', start: '21:00', end: '01:00' });
    expect(s.startsAt.toISOString()).toBe('2026-11-15T02:00:00.000Z');
    expect(s.endsAt.toISOString()).toBe('2026-11-15T06:00:00.000Z');
  });

  it('does calendar arithmetic and validates dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(dateLabel('2026-11-14')).toBe('Sat, Nov 14');
    expect(timeLabel('19:30')).toBe('7:30 PM');
    expect(timeLabel('00:15')).toBe('12:15 AM');
    expect(timeLabel('12:00')).toBe('12:00 PM');
  });

  it('lays a month out in full weeks of seven equal squares', () => {
    const nov = monthGrid('2026-11'); // Nov 1 2026 is a Sunday
    expect(nov[0]![0]).toBe('2026-11-01');
    expect(nov.every((w) => w.length === 7)).toBe(true);
    expect(nov.flat().filter(Boolean)).toHaveLength(30);
    const feb = monthGrid('2026-02'); // Feb 1 2026 is a Sunday too; Jan 2027 starts on Friday
    expect(feb.flat().filter(Boolean)).toHaveLength(28);
    expect(monthGrid('2027-01')[0]!.slice(0, 5)).toEqual([null, null, null, null, null]);
  });

  it('repeats a session every week up to a date', () => {
    const tuesdays = repeatWeekly(
      { date: '2026-11-03', start: '19:00', end: '21:00' },
      '2026-11-24',
    );
    expect(tuesdays.map((s) => s.date)).toEqual([
      '2026-11-03',
      '2026-11-10',
      '2026-11-17',
      '2026-11-24',
    ]);
  });
});

describe('D230 event input', () => {
  const base = {
    title: 'PorchFest',
    description: 'Bands on porches all over Riverside.',
    category: 'music',
    setting: 'outdoor',
    free: true,
    latitude: 30.31,
    longitude: -81.69,
    sessions: [{ date: '2026-11-14', start: '12:00', end: '20:00' }],
  };

  it('accepts a community event with a pin', () => {
    expect(eventInputSchema.safeParse(base).success).toBe(true);
  });

  it('needs a place or a pin, both coordinates, and a place for business events', () => {
    const { latitude: _a, longitude: _b, ...noPin } = base;
    expect(eventInputSchema.safeParse(noPin).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, longitude: undefined }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, hostKind: 'business' }).success).toBe(false);
  });

  it('refuses a price on a free event, a repeated session and unknown fields', () => {
    expect(eventInputSchema.safeParse({ ...base, priceText: '$10' }).success).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...base, sessions: [base.sessions[0], base.sessions[0]] })
        .success,
    ).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, status: 'APPROVED' }).success).toBe(false);
  });
});
