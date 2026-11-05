import { describe, expect, it } from 'vitest';
import { AD_REPORT_REASONS, CONTENT_REPORT_REASONS, reportCreateSchema } from './report';

// D209: ads have their own report reasons (D207's photo rules); they never apply elsewhere.

const reading = { latitude: 30.3, longitude: -81.6, accuracyMeters: 10, timestamp: 1 };
const ad = { type: 'ad', id: '00000000-0000-7000-8000-000000000000' } as const;
const post = { type: 'general', id: '00000000-0000-7000-8000-000000000000' } as const;
const ok = (target: object, reason: string) =>
  reportCreateSchema.safeParse({ reading, target, reason }).success;

describe('ad report reasons', () => {
  it('ads take the ad list (the AI photo rules included)', () => {
    expect(ok(ad, 'AD_AI_FOOD')).toBe(true);
    expect(ok(ad, 'AD_AI_IMAGE')).toBe(true);
    expect(ok(ad, 'SCAM')).toBe(true);
    expect(ok(ad, 'DOXXING')).toBe(false);
  });

  it('the ad-only reasons never apply to posts', () => {
    expect(ok(post, 'AD_AI_FOOD')).toBe(false);
    expect(ok(post, 'HARASSMENT')).toBe(true);
    expect(CONTENT_REPORT_REASONS.some((r) => r.startsWith('AD_'))).toBe(false);
    expect(AD_REPORT_REASONS).toContain('OTHER');
  });
});
