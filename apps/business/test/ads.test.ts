import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AD_LIBRARY_MAX, adDraftSchema, type AdDraft } from '@jax/shared';
import { processAdImage, readAdMedia, uploadAdMedia } from '@/server/ad-media';
import { createAd, deleteAd, getAd, listAds, moveAd, submitAd, updateAd } from '@/server/ads';
import { db } from '@/server/db';
import { invalidateScreeningCache } from '@/server/screening';
import { MemoryStore, setObjectStore } from '@/server/store';
import { makeAccount, makePlace, resetBusinessData } from './helpers';

// B3.2 (D166, D167, D177): the ad library.

const ZIP = '99980';
let store: MemoryStore;
let owner: Awaited<ReturnType<typeof makeAccount>>;
let manager: Awaited<ReturnType<typeof makeAccount>>;
let placeId: string;

const draft = (over: Partial<AdDraft> = {}): AdDraft =>
  adDraftSchema.parse({
    placeId,
    template: 'POST',
    headline: 'Half-price wings',
    body: 'Tonight only',
    radiusMeters: 1600,
    ...over,
  });

async function givePlan(liveAdLimit: number) {
  const plan = await db.plan.create({
    data: { name: `Plan ${liveAdLimit} ${Date.now()}`, liveAdLimit },
  });
  await db.subscription.create({
    data: {
      accountId: owner.id,
      planId: plan.id,
      startsAt: new Date(Date.now() - 1000),
      comped: true,
    },
  });
}

/** An approved ad, as B3.3 will leave it. */
async function approved(over: Partial<AdDraft> = {}) {
  const ad = await createAd(owner, draft(over));
  await db.ad.update({
    where: { id: ad.id },
    data: { status: 'APPROVED', approvedAt: new Date() },
  });
  return ad.id;
}

const picture = (width: number, height: number, withExif = false) => {
  const img = sharp({ create: { width, height, channels: 3, background: '#136677' } });
  return (withExif ? img.withMetadata({ exif: { IFD0: { Artist: 'Secret Person' } } }) : img)
    .jpeg()
    .toBuffer();
};

beforeEach(async () => {
  await resetBusinessData();
  store = new MemoryStore();
  setObjectStore(store);
  owner = await makeAccount();
  manager = await db.businessAccount.create({
    data: { username: 'mia.bb', passwordHash: 'x', createdById: owner.id },
  });
  placeId = (await makePlace('Bold Bean')).id;
  await db.businessPlaceAccess.createMany({
    data: [
      { accountId: owner.id, placeId, role: 'OWNER' },
      { accountId: manager.id, placeId, role: 'MANAGER' },
    ],
  });
  await db.$executeRaw`DELETE FROM "ZipArea" WHERE zip = ${ZIP}`;
  await db.$executeRaw`INSERT INTO "ZipArea" (zip) VALUES (${ZIP})`;
});
afterEach(async () => {
  await db.$executeRaw`DELETE FROM "ZipArea" WHERE zip = ${ZIP}`;
  await db.screeningRule.deleteMany({ where: { term: 'scamword' } });
  invalidateScreeningCache();
});
afterAll(() => setObjectStore(null));

describe('B3.2 drafting and sending', () => {
  it('a Manager drafts; only the Owner sends it, and only with a plan', async () => {
    const ad = await createAd(manager, draft());
    expect(ad).toMatchObject({ status: 'DRAFT', state: 'DRAFT', placeName: 'Bold Bean' });
    await expect(submitAd(manager, ad.id)).rejects.toMatchObject({ status: 403, code: 'ROLE' });
    await expect(submitAd(owner, ad.id)).rejects.toMatchObject({ code: 'PLAN' });
    await givePlan(1);
    expect((await submitAd(owner, ad.id)).status).toBe('PENDING_REVIEW');
    await expect(submitAd(owner, ad.id)).rejects.toMatchObject({ code: 'STATE' });
  });

  it('an unfinished ad says what is missing', async () => {
    await givePlan(1);
    const ad = await createAd(
      owner,
      draft({ template: 'FEATURE', body: null, radiusMeters: null }),
    );
    const err = await submitAd(owner, ad.id).catch((e) => e);
    expect(err.code).toBe('NOT_READY');
    expect(err.details.problems).toEqual([
      'A feature needs a picture or GIF.',
      'Choose who sees it: a distance around your place, ZIP codes, or both.',
    ]);
  });

  it('keeps at most 20 ads per business', async () => {
    for (let i = 0; i < AD_LIBRARY_MAX; i++) await createAd(owner, draft({ headline: `Ad ${i}` }));
    await expect(createAd(manager, draft())).rejects.toMatchObject({ code: 'LIBRARY_FULL' });
    const lib = await listAds(owner);
    expect(lib.saved).toBe(AD_LIBRARY_MAX);
    // Deleting one makes room.
    await deleteAd(owner, lib.ads[0]!.id);
    expect((await createAd(owner, draft())).status).toBe('DRAFT');
  });

  it('only ZIP codes in the JaxSide area, only the business’s own pictures, no blocked words', async () => {
    await expect(createAd(owner, draft({ zips: ['12345'] }))).rejects.toMatchObject({
      status: 400,
    });
    expect((await createAd(owner, draft({ zips: [ZIP], radiusMeters: null }))).zips).toEqual([ZIP]);

    const other = await makeAccount({ email: 'other@example.com' });
    const theirs = await db.adMedia.create({ data: { accountId: other.id, status: 'ACTIVE' } });
    await expect(createAd(owner, draft({ mediaId: theirs.id }))).rejects.toMatchObject({
      status: 400,
    });

    await db.screeningRule.create({
      data: { term: 'scamword', match: 'WORD', action: 'BLOCK', category: 'SPAM' },
    });
    invalidateScreeningCache();
    await expect(createAd(owner, draft({ headline: 'Big scamword deal' }))).rejects.toMatchObject({
      code: 'CONTENT_BLOCKED',
    });
  });
});

describe('B3.2 changes to running ads', () => {
  it('editing an approved ad sends it back for approval (Owner) or to draft (Manager)', async () => {
    await givePlan(3);
    const a = await approved();
    expect((await updateAd(owner, a, draft({ headline: 'New price' }))).status).toBe(
      'PENDING_REVIEW',
    );
    const b = await approved();
    expect((await updateAd(manager, b, draft({ headline: 'Typo fix' }))).status).toBe('DRAFT');
    const row = await db.ad.findUniqueOrThrow({ where: { id: b } });
    expect(row.approvedAt).toBeNull();
  });

  it('pause, resume (only if the plan has room), end; scheduled ads count too (Q35)', async () => {
    await givePlan(1);
    const live = await approved();
    expect((await moveAd(owner, live, 'pause')).status).toBe('PAUSED');
    // Another ad, scheduled for next week, takes the one slot.
    await approved({ startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    expect((await listAds(owner)).running).toBe(1);
    await expect(moveAd(owner, live, 'resume')).rejects.toMatchObject({ code: 'PLAN_FULL' });
    await expect(moveAd(manager, live, 'end')).rejects.toMatchObject({ code: 'ROLE' });
    expect((await moveAd(owner, live, 'end')).status).toBe('ENDED');
    await expect(moveAd(owner, live, 'pause')).rejects.toMatchObject({ code: 'STATE' });
  });

  it('a live ad can’t be deleted; an ended one can', async () => {
    await givePlan(1);
    const a = await approved();
    await expect(deleteAd(owner, a)).rejects.toMatchObject({ code: 'STATE' });
    await moveAd(owner, a, 'end');
    await deleteAd(owner, a);
    expect(await db.ad.count()).toBe(0);
  });
});

describe('🔒 B3.2 boundaries', () => {
  it('another business, and Staff, can’t see or change the ads', async () => {
    const ad = await createAd(owner, draft());
    const other = await makeAccount({ email: 'other@example.com' });
    await expect(getAd(other, ad.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateAd(other, ad.id, draft())).rejects.toMatchObject({ status: 404 });
    await expect(deleteAd(other, ad.id)).rejects.toMatchObject({ status: 404 });
    expect((await listAds(other)).ads).toEqual([]);

    const staff = await db.businessAccount.create({
      data: { username: 'sam.bb', passwordHash: 'x', createdById: owner.id },
    });
    await db.businessPlaceAccess.create({ data: { accountId: staff.id, placeId, role: 'STAFF' } });
    expect((await listAds(staff)).ads).toEqual([]);
    await expect(getAd(staff, ad.id)).rejects.toMatchObject({ status: 403 });
    await expect(createAd(staff, draft())).rejects.toMatchObject({ status: 403 });
  });
});

describe('B3.2 pictures', () => {
  it('fits the template size exactly and drops all metadata', async () => {
    const out = await processAdImage('BANNER', await picture(2400, 600, true));
    expect(out).toMatchObject({ width: 1200, height: 300, mimeType: 'image/jpeg' });
    const meta = await sharp(out.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.data.toString('latin1')).not.toContain('Secret Person');
  });

  it('refuses the wrong shape, too small, and files that aren’t pictures, in plain words', async () => {
    await expect(processAdImage('BANNER', await picture(1080, 1080))).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
      message: expect.stringMatching(/wrong shape for a banner/),
    });
    await expect(processAdImage('POST', await picture(300, 300))).rejects.toMatchObject({
      message: expect.stringMatching(/too small/),
    });
    await expect(
      processAdImage('POST', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).rejects.toMatchObject({ message: expect.stringMatching(/choose a picture/i) });
  });

  it('stores the clean copy; only the same business can open it', async () => {
    const up = await uploadAdMedia(manager, placeId, 'POST', await picture(1080, 1080));
    expect(up).toMatchObject({ width: 1080, height: 1080, gif: false });
    expect([...store.objects.keys()][0]).toMatch(/^ads\/[0-9a-f]{48}\.jpg$/);
    expect(await readAdMedia(owner, up.id)).not.toBeNull(); // the owner sees the manager's upload
    const other = await makeAccount({ email: 'other@example.com' });
    expect(await readAdMedia(other, up.id)).toBeNull();
    // It can be used in an ad.
    expect((await createAd(manager, draft({ mediaId: up.id }))).mediaUrl).toBe(
      `/api/ads/media/${up.id}`,
    );
  });
});
