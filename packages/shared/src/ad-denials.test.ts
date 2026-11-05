import { describe, expect, it } from 'vitest';
import { AD_DENIAL_CODES, AD_DENIAL_GROUPS, adDenial, adDenialMessage } from './ad-denials';
import { adminAdDecisionSchema } from './schemas/admin';

describe('ad denial reasons (D211)', () => {
  it('every code is unique and every reason but "Something else" has wording', () => {
    expect(new Set(AD_DENIAL_CODES).size).toBe(AD_DENIAL_CODES.length);
    for (const g of AD_DENIAL_GROUPS) {
      for (const r of g.reasons) {
        if (g.code !== 'OTHER') expect(r.text.length).toBeGreaterThan(10);
        expect(adDenial(r.code)?.group.code).toBe(g.code);
      }
    }
  });

  it('builds the message the business reads, never over 500 characters', () => {
    expect(adDenialMessage('DRUGS')).toBe(
      'Never allowed: Ads can’t show illegal drugs or drug paraphernalia, or make drug use look good.',
    );
    expect(adDenialMessage('OTHER', '  Add your hours ')).toBe('Add your hours');
    for (const code of AD_DENIAL_CODES) {
      expect(adDenialMessage(code, 'x'.repeat(300)).length).toBeLessThanOrEqual(500);
    }
  });

  it('the decision needs a known reason to turn an ad down, and a note for "Something else"', () => {
    const ok = (v: unknown) => adminAdDecisionSchema.safeParse(v).success;
    expect(ok({ decision: 'approve' })).toBe(true);
    expect(ok({ decision: 'reject' })).toBe(false);
    expect(ok({ decision: 'reject', reasonCode: 'AI_FOOD' })).toBe(true);
    expect(ok({ decision: 'reject', reasonCode: 'NOPE' })).toBe(false);
    expect(ok({ decision: 'reject', reasonCode: 'OTHER' })).toBe(false);
    expect(ok({ decision: 'reject', reasonCode: 'OTHER', note: 'Add your hours' })).toBe(true);
  });
});
