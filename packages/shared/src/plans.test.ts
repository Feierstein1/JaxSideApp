import { describe, expect, it } from 'vitest';
import { planEntitlementInputSchema, planEntitlements } from './plans';

// D202: tier entitlements are rows of key + JSON value; reading them never trusts a bad row.

describe('planEntitlements', () => {
  it('turns rows into one object', () => {
    expect(
      planEntitlements([
        { key: 'ads.live', value: 3 },
        { key: 'insights', value: true },
      ]),
    ).toEqual({ 'ads.live': 3, insights: true });
  });

  // 🔒 A typo or a wrong value never grants anything.
  it('leaves out unknown keys and wrong values', () => {
    expect(
      planEntitlements([
        { key: 'ads.lives', value: 3 },
        { key: 'ads.live', value: 99 },
        { key: 'insights', value: 'yes' },
      ]),
    ).toEqual({});
  });

  it('the input schema refuses what reading would ignore', () => {
    expect(planEntitlementInputSchema.safeParse({ key: 'ads.live', value: 2 }).success).toBe(true);
    expect(planEntitlementInputSchema.safeParse({ key: 'nope', value: 2 }).success).toBe(false);
    expect(planEntitlementInputSchema.safeParse({ key: 'ads.live', value: 4 }).success).toBe(false);
  });
});
