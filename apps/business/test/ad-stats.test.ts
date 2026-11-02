import { beforeEach, describe, expect, it } from 'vitest';
import { adStats } from '@/server/ad-stats';
import { db } from '@/server/db';
import { makeAccount, makePlace, resetBusinessData } from './helpers';

// B3.5: an ad's results for the Owner: totals, no breakdown under 10, never who.

const DAY = 86_400_000;
let owner: Awaited<ReturnType<typeof makeAccount>>;
let placeId: string;
let adId: string;

const day = (daysAgo: number) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);
};

beforeEach(async () => {
  await resetBusinessData();
  owner = await makeAccount();
  placeId = (await makePlace()).id;
  await db.businessPlaceAccess.create({ data: { accountId: owner.id, placeId, role: 'OWNER' } });
  adId = (
    await db.ad.create({
      data: {
        accountId: owner.id,
        placeId,
        template: 'POST',
        headline: 'Wings',
        status: 'APPROVED',
      },
    })
  ).id;
  await db.adDailyStats.createMany({
    data: [
      { adId, day: day(1), views: 120, interested: 14, notInterested: 3 },
      { adId, day: day(2), views: 9, interested: 0, notInterested: 1 },
      { adId, day: day(45), views: 300, interested: 20, notInterested: 10 },
    ],
  });
});

describe('B3.5 ad results', () => {
  it('totals for 30 days and all time; small days show as "fewer than 10"', async () => {
    const s = await adStats(owner, adId);
    expect(s.last30Days).toEqual({ views: 129, interested: 14, notInterested: 4 });
    expect(s.allTime).toEqual({ views: 429, interested: 34, notInterested: 14 });
    expect(s.days[0]).toMatchObject({ views: 120, interested: 14, notInterested: null });
    expect(s.days[1]).toMatchObject({ views: null, interested: null, notInterested: null });
    expect(JSON.stringify(s)).not.toMatch(/userId|username|email|zip/i);
  });

  it('🔒 the Owner only: not Managers, not another business', async () => {
    const manager = await db.businessAccount.create({
      data: { username: 'mia.bb', passwordHash: 'x', createdById: owner.id },
    });
    await db.businessPlaceAccess.create({
      data: { accountId: manager.id, placeId, role: 'MANAGER' },
    });
    await expect(adStats(manager, adId)).rejects.toMatchObject({ status: 403 });
    const other = await makeAccount({ email: 'other@example.com' });
    await expect(adStats(other, adId)).rejects.toMatchObject({ status: 404 });
  });
});
