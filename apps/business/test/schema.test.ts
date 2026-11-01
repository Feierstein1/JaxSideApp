import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { makeAccount, makePlace, resetBusinessData } from './helpers';

beforeEach(resetBusinessData);

/** B1.1: the database itself refuses rows that break the business rules. */
describe('business tables', () => {
  it('needs an email or a username on every account', async () => {
    await expect(db.businessAccount.create({ data: { passwordHash: 'x' } })).rejects.toThrow();
  });

  it('allows one live Owner per place, and one live access per account and place', async () => {
    const place = await makePlace();
    const a = await makeAccount();
    const b = await makeAccount({ email: 'other@example.com' });
    await db.businessPlaceAccess.create({
      data: { accountId: a.id, placeId: place.id, role: 'OWNER' },
    });
    await expect(
      db.businessPlaceAccess.create({
        data: { accountId: b.id, placeId: place.id, role: 'OWNER' },
      }),
    ).rejects.toThrow();
    await expect(
      db.businessPlaceAccess.create({
        data: { accountId: a.id, placeId: place.id, role: 'STAFF' },
      }),
    ).rejects.toThrow();
    // A revoked Owner frees the place for a new one.
    await db.businessPlaceAccess.updateMany({ data: { revokedAt: new Date() } });
    await db.businessPlaceAccess.create({
      data: { accountId: b.id, placeId: place.id, role: 'OWNER' },
    });
  });

  it('caps plans at 3 live ads and allows one active subscription per business', async () => {
    await expect(db.plan.create({ data: { name: 'Too big', liveAdLimit: 4 } })).rejects.toThrow();
    const plan = await db.plan.create({ data: { name: 'Promo', liveAdLimit: 3 } });
    const a = await makeAccount();
    await db.subscription.create({
      data: { accountId: a.id, planId: plan.id, startsAt: new Date(), comped: true },
    });
    await expect(
      db.subscription.create({ data: { accountId: a.id, planId: plan.id, startsAt: new Date() } }),
    ).rejects.toThrow();
  });

  it('refuses ads with impossible schedules or targeting', async () => {
    const place = await makePlace();
    const a = await makeAccount();
    const base = {
      accountId: a.id,
      placeId: place.id,
      template: 'BANNER' as const,
      headline: 'Hi',
    };
    await db.ad.create({ data: base });
    const now = Date.now();
    for (const bad of [
      { daysOfWeek: 0 },
      { daysOfWeek: 128 },
      { dailyStartMin: 600 }, // only one end of the daily window
      { dailyStartMin: 600, dailyEndMin: 600 },
      { dailyStartMin: 600, dailyEndMin: 1441 },
      { startsAt: new Date(now), endsAt: new Date(now - 1000) },
      { radiusMeters: 10 },
      { zips: Array.from({ length: 31 }, (_, i) => String(32200 + i)) },
    ]) {
      await expect(db.ad.create({ data: { ...base, ...bad } })).rejects.toThrow();
    }
    // Happy hour, Tue–Fri 4–7pm.
    await db.ad.create({
      data: { ...base, daysOfWeek: 0b0111100, dailyStartMin: 16 * 60, dailyEndMin: 19 * 60 },
    });
  });
});
