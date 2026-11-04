import { beforeEach, describe, expect, it } from 'vitest';
import { getCase, listCases } from '@/server/admin/queue';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { createReport } from '@/server/reports';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { createTestUser } from './user-factory';

// D194: a business login can report what people post in its own place's discussion (the
// website writes the report). It goes to the admin queue, labelled as the business, and
// never counts toward auto-hide (D73) or auto-suspend (D74).

const DAY = 86_400_000;

let cafe: string;
let owner: { id: string };
let author: Awaited<ReturnType<typeof createTestUser>>;
let postId: string;

const person = (name: string) =>
  createTestUser(name, { emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 30 * DAY) });
const businessReport = (businessPostId: string) =>
  db.report.create({
    data: { reporterBusinessId: owner.id, businessPostId, reason: 'HARASSMENT' },
  });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  // Two people's reports hide a post, and two people's reports suspend an account.
  await db.appConfiguration.createMany({
    data: [
      { key: 'moderation.autoHideReports', value: 2 },
      { key: 'moderation.autoSuspendReporters', value: 2 },
    ],
    skipDuplicates: true,
  });
  invalidateConfigCache();
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
  owner = await db.businessAccount.create({
    data: { email: 'owner@boldbean.com', passwordHash: 'x' },
  });
  await db.businessPlaceAccess.create({
    data: { accountId: owner.id, placeId: cafe, role: 'OWNER' },
  });
  author = await person('critic_r');
  postId = (
    await db.businessPost.create({
      data: { placeId: cafe, authorId: author.id, body: 'Waited an hour for cold coffee' },
    })
  ).id;
  // Posts made here skip the place's post count; set it as posting would.
  await db.businessPlace.update({ where: { id: cafe }, data: { postCount: 5 } });
}, 60_000);

describe('business reports (D194)', () => {
  it('reach the admin queue labelled as the business', async () => {
    await businessReport(postId);
    const cases = await listCases();
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ id: postId, fromBusiness: true, automatic: false });
    const c = await getCase({ type: 'business', id: postId });
    expect(c.reports.map((r) => r.reporter)).toEqual([
      'a business: Bold Bean (owner@boldbean.com)',
    ]);
  });

  // 🔒 A business can't hide a critic's post: its report never counts toward auto-hide.
  it('never count toward auto-hide, even with a person’s report', async () => {
    await businessReport(postId);
    const fan = await person('fan_r');
    await createReport(
      { kind: 'user', user: fan },
      { target: { type: 'business', id: postId }, reason: 'SPAM' },
    );
    expect((await db.businessPost.findUniqueOrThrow({ where: { id: postId } })).status).toBe(
      'VISIBLE',
    );
    // A second person does reach the threshold of two.
    const other = await person('other_r');
    await createReport(
      { kind: 'user', user: other },
      { target: { type: 'business', id: postId }, reason: 'SPAM' },
    );
    expect((await db.businessPost.findUniqueOrThrow({ where: { id: postId } })).status).toBe(
      'HELD_FOR_REVIEW',
    );
  });

  // 🔒 Nor toward auto-suspending the person who wrote it.
  it('never count toward auto-suspend', async () => {
    const second = (
      await db.businessPost.create({
        data: { placeId: cafe, authorId: author.id, body: 'Again rude' },
      })
    ).id;
    await businessReport(postId);
    await businessReport(second);
    const fan = await person('fan_s');
    await createReport(
      { kind: 'user', user: fan },
      { target: { type: 'business', id: second }, reason: 'SPAM' },
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: author.id } })).status).toBe('ACTIVE');
  });

  // 🔒 A report has one reporter at most.
  it('the database refuses a report filed by both a person and a business', async () => {
    const fan = await person('fan_t');
    await expect(
      db.report.create({
        data: {
          reporterUserId: fan.id,
          reporterBusinessId: owner.id,
          businessPostId: postId,
          reason: 'SPAM',
        },
      }),
    ).rejects.toThrow();
  });
});
