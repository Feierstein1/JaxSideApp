import { describe, expect, it } from 'vitest';
import { adDraftSchema, adSubmitProblems, planLimitProblem } from './ads';

const PLACE = '01a1936d-1930-746f-9bf1-cc48335965d2';
const MEDIA = '01a1936d-1930-746f-9bf1-cc48335965d3';
const now = new Date('2026-07-05T12:00:00Z');

const draft = (over: Record<string, unknown> = {}) =>
  adDraftSchema.parse({ placeId: PLACE, template: 'POST', headline: 'Half-price wings', ...over });

describe('ad drafts', () => {
  it('fills in sensible defaults for an unfinished draft', () => {
    expect(draft()).toMatchObject({
      body: null,
      mediaId: null,
      adultsOnly: false,
      daysOfWeek: 127,
      dailyStartMin: null,
      radiusMeters: null,
      zips: [],
    });
  });

  it('refuses impossible schedules and targeting, and unknown fields', () => {
    const bad = (over: Record<string, unknown>) =>
      adDraftSchema.safeParse({ placeId: PLACE, template: 'POST', headline: 'x', ...over }).success;
    expect(bad({ daysOfWeek: 0 })).toBe(false);
    expect(bad({ dailyStartMin: 960 })).toBe(false); // only one end
    expect(bad({ dailyStartMin: 960, dailyEndMin: 960 })).toBe(false);
    expect(bad({ startsAt: '2026-07-10T00:00:00Z', endsAt: '2026-07-09T00:00:00Z' })).toBe(false);
    expect(bad({ radiusMeters: 50 })).toBe(false);
    expect(bad({ zips: ['3220'] })).toBe(false);
    expect(bad({ zips: ['32202', '32202'] })).toBe(false);
    expect(bad({ status: 'APPROVED' })).toBe(false); // the owner can't approve their own ad
    expect(bad({ template: 'CUSTOM' })).toBe(false);
    // A window past midnight is fine.
    expect(bad({ dailyStartMin: 22 * 60, dailyEndMin: 120 })).toBe(true);
  });

  // D236: an organizer's ad promotes an event and has no place; it needs one or the other.
  it('takes a place, an event or both, never neither; city-wide needs no area', () => {
    const EVENT = '01a1936d-1930-746f-9bf1-cc48335965d4';
    const ok = (body: Record<string, unknown>) =>
      adDraftSchema.safeParse({ template: 'BANNER', headline: 'Jazz night', ...body }).success;
    expect(ok({ eventId: EVENT })).toBe(true);
    expect(ok({ placeId: PLACE, eventId: EVENT })).toBe(true);
    expect(ok({})).toBe(false);
    const cityWide = adDraftSchema.parse({
      eventId: EVENT,
      template: 'BANNER',
      headline: 'Jazz night downtown',
      mediaId: MEDIA,
      cityWide: true,
    });
    expect(adSubmitProblems(cityWide, now)).toEqual([]);
  });
});

describe('ready to send for approval', () => {
  it('a finished ad has no problems', () => {
    expect(adSubmitProblems(draft({ radiusMeters: 1600 }), now)).toEqual([]);
    expect(
      adSubmitProblems(
        draft({ template: 'BANNER', headline: 'Wings!', mediaId: MEDIA, zips: ['32202'] }),
        now,
      ),
    ).toEqual([]);
  });

  it('says what is missing in plain words', () => {
    expect(adSubmitProblems(draft({ template: 'FEATURE', headline: '' }), now)).toEqual([
      'Add a headline.',
      'A feature needs a picture or GIF.',
      'Choose who sees it: a distance around your place, ZIP codes, or both.',
    ]);
    expect(
      adSubmitProblems(draft({ radiusMeters: 500, endsAt: '2026-07-01T00:00:00Z' }), now),
    ).toEqual(['The end date has already passed.']);
    expect(
      adSubmitProblems(
        draft({ template: 'BANNER', mediaId: MEDIA, zips: ['32202'], body: 'more words' }),
        now,
      ),
    ).toEqual(['A banner has no room for more text.']);
  });

  it('plan limits: at most 5 (D204), a plan may allow fewer, 0 = no ads', () => {
    expect(planLimitProblem(0, 1)).toBeNull();
    expect(planLimitProblem(1, 1)).toBe(
      'Your plan runs 1 ad at a time. Pause or end the live one first.',
    );
    expect(planLimitProblem(2, 3)).toBeNull();
    expect(planLimitProblem(3, 5)).toBeNull();
    expect(planLimitProblem(5, 9)).toBe('Your plan runs 5 ads at a time. Pause or end one first.');
    expect(planLimitProblem(0, 0)).toBe('Your plan doesn’t include ads.');
  });
});
