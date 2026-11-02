import { describe, expect, it } from 'vitest';
import {
  AD_TEMPLATES,
  adDisplayState,
  adSlots,
  checkAdImage,
  checkAdText,
  chooseAds,
  describeDays,
  describeSchedule,
  inSchedule,
  jacksonvilleClock,
  metersBetween,
  mixAds,
  seedFrom,
  takesPlanSlot,
  targetsReader,
  type AdSchedule,
} from './ads';

const TUE_TO_FRI = 0b0111100; // bits 2..5
const FRIDAY = 1 << 5;
const happyHour: AdSchedule = {
  startsAt: null,
  endsAt: null,
  daysOfWeek: TUE_TO_FRI,
  dailyStartMin: 16 * 60,
  dailyEndMin: 19 * 60,
};
const at = (iso: string) => new Date(iso);

describe('Jacksonville clock', () => {
  it('follows daylight saving both ways', () => {
    // 2026-03-08: 1:59 am EST, then 3:00 am EDT one minute later.
    expect(jacksonvilleClock(at('2026-03-08T06:59:00Z'))).toEqual({ weekday: 0, minute: 119 });
    expect(jacksonvilleClock(at('2026-03-08T07:00:00Z'))).toEqual({ weekday: 0, minute: 180 });
    // 2026-11-01: 1:30 am happens twice (EDT, then EST).
    expect(jacksonvilleClock(at('2026-11-01T05:30:00Z')).minute).toBe(90);
    expect(jacksonvilleClock(at('2026-11-01T06:30:00Z')).minute).toBe(90);
  });
});

describe('ad schedule', () => {
  it('happy hour Tue–Fri 4–7 pm, in summer and winter time', () => {
    expect(inSchedule(happyHour, at('2026-07-07T20:30:00Z'))).toBe(true); // Tue 4:30 pm EDT
    expect(inSchedule(happyHour, at('2026-07-07T19:30:00Z'))).toBe(false); // Tue 3:30 pm EDT
    expect(inSchedule(happyHour, at('2026-12-08T21:30:00Z'))).toBe(true); // Tue 4:30 pm EST
    expect(inSchedule(happyHour, at('2026-12-08T20:30:00Z'))).toBe(false); // Tue 3:30 pm EST
    expect(inSchedule(happyHour, at('2026-12-09T00:00:00Z'))).toBe(false); // Tue 7:00 pm: ended
    expect(inSchedule(happyHour, at('2026-12-07T21:30:00Z'))).toBe(false); // Monday
  });

  it('a window past midnight belongs to the day it starts', () => {
    const lateFriday: AdSchedule = {
      ...happyHour,
      daysOfWeek: FRIDAY,
      dailyStartMin: 22 * 60,
      dailyEndMin: 2 * 60,
    };
    expect(inSchedule(lateFriday, at('2026-07-11T03:00:00Z'))).toBe(true); // Fri 11 pm
    expect(inSchedule(lateFriday, at('2026-07-11T05:00:00Z'))).toBe(true); // Sat 1 am
    expect(inSchedule(lateFriday, at('2026-07-10T05:00:00Z'))).toBe(false); // Fri 1 am
    expect(inSchedule(lateFriday, at('2026-07-12T03:00:00Z'))).toBe(false); // Sat 11 pm
  });

  it('respects the start and end dates, and "all day"', () => {
    const allDay: AdSchedule = {
      startsAt: at('2026-07-01T04:00:00Z'),
      endsAt: at('2026-07-08T04:00:00Z'),
      daysOfWeek: 127,
      dailyStartMin: null,
      dailyEndMin: null,
    };
    expect(inSchedule(allDay, at('2026-06-30T12:00:00Z'))).toBe(false);
    expect(inSchedule(allDay, at('2026-07-03T12:00:00Z'))).toBe(true);
    expect(inSchedule(allDay, at('2026-07-08T04:00:00Z'))).toBe(false); // the end is exclusive
  });

  it('says it the way an owner would', () => {
    expect(describeSchedule(happyHour)).toBe('Tue–Fri, 4:00 pm–7:00 pm');
    expect(describeSchedule({ daysOfWeek: 127, dailyStartMin: null, dailyEndMin: null })).toBe(
      'every day, all day',
    );
    expect(describeDays(0b0101010)).toBe('Mon, Wed, Fri');
    expect(describeDays(0b0111110)).toBe('weekdays');
    expect(describeDays(0b1000001)).toBe('weekends');
    expect(describeSchedule({ daysOfWeek: FRIDAY, dailyStartMin: 22 * 60, dailyEndMin: 120 })).toBe(
      'Fri, 10:00 pm–2:00 am',
    );
    expect(describeSchedule({ daysOfWeek: 1, dailyStartMin: 690, dailyEndMin: 720 })).toBe(
      'Sun, 11:30 am–noon',
    );
  });
});

describe('ad states and plan slots', () => {
  const now = at('2026-07-05T12:00:00Z');
  const approved = (startsAt: string | null, endsAt: string | null) => ({
    status: 'APPROVED' as const,
    startsAt: startsAt ? at(startsAt) : null,
    endsAt: endsAt ? at(endsAt) : null,
  });

  it('an approved ad is scheduled, live, then ended by its dates', () => {
    expect(adDisplayState(approved('2026-07-10T00:00:00Z', null), now)).toBe('SCHEDULED');
    expect(adDisplayState(approved('2026-07-01T00:00:00Z', '2026-07-10T00:00:00Z'), now)).toBe(
      'LIVE',
    );
    expect(adDisplayState(approved(null, '2026-07-01T00:00:00Z'), now)).toBe('ENDED');
    expect(adDisplayState({ status: 'DRAFT', startsAt: null, endsAt: null }, now)).toBe('DRAFT');
  });

  it('live and scheduled ads take a plan slot; paused, ended and drafts don’t', () => {
    expect(takesPlanSlot(approved(null, null), now)).toBe(true);
    expect(takesPlanSlot(approved('2026-08-01T00:00:00Z', null), now)).toBe(true);
    expect(takesPlanSlot(approved(null, '2026-07-01T00:00:00Z'), now)).toBe(false);
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'PAUSED', 'ENDED'] as const) {
      expect(takesPlanSlot({ status, startsAt: null, endsAt: null }, now)).toBe(false);
    }
  });
});

describe('templates', () => {
  it('accepts the template size or larger in the same shape', () => {
    expect(
      checkAdImage('BANNER', { width: 1200, height: 300, bytes: 400_000, gif: false }),
    ).toEqual([]);
    expect(
      checkAdImage('BANNER', { width: 2400, height: 600, bytes: 900_000, gif: false }),
    ).toEqual([]);
    expect(
      checkAdImage('FEATURE', { width: 1080, height: 1350, bytes: 3_500_000, gif: true }),
    ).toEqual([]);
  });

  it('explains problems in plain words', () => {
    const [shape] = checkAdImage('BANNER', { width: 1080, height: 1080, bytes: 1, gif: false });
    expect(shape).toMatch(/wrong shape for a banner\. Use 1200 × 300 pixels/);
    const small = checkAdImage('POST', { width: 300, height: 300, bytes: 1, gif: false });
    expect(small).toEqual([
      expect.stringMatching(/too small \(300 × 300\)\. It needs at least 600 × 600/),
    ]);
    const big = checkAdImage('POST', { width: 1080, height: 1080, bytes: 5_000_000, gif: false });
    expect(big).toEqual(['This picture is too big (5.0 MB). The limit is 2.0 MB.']);
  });

  it('checks headline and text length per template', () => {
    expect(checkAdText('POST', { headline: 'Half-price wings', body: 'Tonight only' })).toEqual([]);
    expect(checkAdText('BANNER', { headline: 'x'.repeat(41) })).toEqual([
      'Keep the headline to 40 characters (it has 41).',
    ]);
    expect(checkAdText('BANNER', { headline: 'Wings', body: 'more' })).toEqual([
      'A banner has no room for more text.',
    ]);
    expect(checkAdText('FEATURE', { headline: ' ', body: 'x'.repeat(141) })).toHaveLength(2);
    expect(AD_TEMPLATES.POST.bodyMax).toBe(280);
  });
});

describe('targeting by the reader’s location only', () => {
  const place = { latitude: 30.3322, longitude: -81.6557 }; // downtown Jacksonville
  const near = { latitude: 30.3322 + 0.009, longitude: -81.6557 }; // ~1 km north

  it('measures distance about right', () => {
    expect(Math.round(metersBetween(place, near) / 10) * 10).toBe(1000);
  });

  it('inside the radius or in a chosen ZIP sees it; anyone else doesn’t', () => {
    const radius = { radiusMeters: 1500, zips: [] };
    expect(targetsReader(radius, place, { point: near, zip: null })).toBe(true);
    expect(targetsReader({ radiusMeters: 500, zips: [] }, place, { point: near, zip: null })).toBe(
      false,
    );
    const zips = { radiusMeters: null, zips: ['32202', '32204'] };
    expect(targetsReader(zips, place, { point: near, zip: '32204' })).toBe(true);
    expect(targetsReader(zips, place, { point: near, zip: '32210' })).toBe(false);
    expect(
      targetsReader({ radiusMeters: null, zips: [] }, place, { point: place, zip: '32202' }),
    ).toBe(false);
  });
});

describe('mixing ads into a page', () => {
  it('puts an ad after every N posts, never first and never at the very end', () => {
    expect(adSlots(30, 8)).toEqual([8, 16, 24]);
    expect(adSlots(8, 8)).toEqual([]); // no ad after the last post
    expect(adSlots(5, 1)).toEqual([2, 4]); // never two in a row
  });

  it('chooses fairly, at most one ad per business, the same way for the same seed', () => {
    const ads = [
      { id: 'a1', businessId: 'A' },
      { id: 'a2', businessId: 'A' },
      { id: 'b1', businessId: 'B' },
      { id: 'c1', businessId: 'C' },
    ];
    const seed = seedFrom('reader-1:page-1');
    const picked = chooseAds(ads, 3, seed);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((a) => a.businessId)).size).toBe(3);
    expect(chooseAds([...ads].reverse(), 3, seed)).toEqual(picked); // input order doesn't matter
    // Over many pages, each of A's ads gets turns.
    const firstA = new Set<string>();
    for (let p = 0; p < 50; p++) {
      const a = chooseAds(ads, 3, seedFrom(`reader-1:page-${p}`)).find((x) => x.businessId === 'A');
      if (a) firstA.add(a.id);
    }
    expect(firstA).toEqual(new Set(['a1', 'a2']));
  });

  it('returns posts and ads in reading order', () => {
    const mixed = mixAds(['p1', 'p2', 'p3', 'p4', 'p5'], ['AD1', 'AD2', 'AD3'], 2);
    expect(mixed.map((m) => m.item)).toEqual(['p1', 'p2', 'AD1', 'p3', 'p4', 'AD2', 'p5']);
  });
});
