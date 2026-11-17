import { beforeEach, describe, expect, it } from 'vitest';
import { purgeUnusedAdMedia } from '@/server/ads/media-cleanup';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { resetDb } from './db-helpers';

// D263 (hub): unused business pictures are deleted daily; a default event picture is kept.

const DAY = 86_400_000;
let owner: string;
let cafe: string;
const media = (createdAt = new Date(Date.now() - 2 * DAY)) =>
  db.adMedia.create({ data: { accountId: owner, status: 'ACTIVE', createdAt } });

beforeEach(async () => {
  await resetDb();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  owner = (await db.businessAccount.create({ data: { email: 'o@x.test', passwordHash: 'x' } })).id;
}, 60_000);

describe('unused business pictures (D263)', () => {
  it('deletes only pictures nothing uses, older than a day', async () => {
    const unused = await media();
    const fresh = await media(new Date());
    const onAd = await media();
    await db.ad.create({
      data: {
        accountId: owner,
        placeId: cafe,
        template: 'POST',
        headline: 'Lattes',
        mediaId: onAd.id,
      },
    });
    const avatar = await media();
    const fallback = await media();
    await db.businessAccount.update({
      where: { id: owner },
      data: { avatarMediaId: avatar.id, defaultEventMediaId: fallback.id },
    });
    expect(await purgeUnusedAdMedia()).toBe(1);
    const left = (await db.adMedia.findMany({ select: { id: true } })).map((m) => m.id).sort();
    expect(left).toEqual([fresh.id, onAd.id, avatar.id, fallback.id].sort());
    expect(await db.adMedia.count({ where: { id: unused.id } })).toBe(0);
  });

  // 🔒 A staff login made by an owner never has its own default event picture.
  it('the default event picture is for owner accounts only', async () => {
    const m = await media();
    const staff = await db.businessAccount.create({
      data: { username: 'sam.x', passwordHash: 'x', createdById: owner },
    });
    await expect(
      db.businessAccount.update({ where: { id: staff.id }, data: { defaultEventMediaId: m.id } }),
    ).rejects.toThrow();
  });
});
