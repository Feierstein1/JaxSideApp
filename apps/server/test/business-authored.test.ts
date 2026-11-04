import { beforeEach, describe, expect, it } from 'vitest';
import { POST as bizCommentPOST } from '@/app/api/v1/business-posts/[id]/comments/route';
import { POST as bizPostPOST } from '@/app/api/v1/business-posts/[id]/route';
import { GET as bellGET } from '@/app/api/v1/notifications/route';
import { POST as roomListPOST } from '@/app/api/v1/places/[id]/posts/list/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D172: posts and replies written on the business website (no phone-app author) show in
// the app as "The Owner", with the optional staff name and nothing else about who wrote them.

const DAY = 86_400_000;
const HERE = { latitude: 30.3151, longitude: -81.686 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let place: string;
let fan: { id: string; token: string };
let sam: { id: string };

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
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
  place = (await db.businessPlace.findFirstOrThrow()).id;
  const u = await createTestUser('fan_b', {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  fan = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
  const owner = await db.businessAccount.create({
    data: { email: 'owner@boldbean.com', passwordHash: 'x' },
  });
  sam = await db.businessAccount.create({
    data: { username: 'sam.secret', passwordHash: 'x', createdById: owner.id },
  });
  await db.businessPlaceAccess.createMany({
    data: [
      { accountId: owner.id, placeId: place, role: 'OWNER' },
      { accountId: sam.id, placeId: place, role: 'STAFF', staffName: 'Sam' },
    ],
  });
});

describe('🔒 business-written posts and replies in the app (D172)', () => {
  it('show as "The Owner · Sam", never the login, and the fan is told', async () => {
    const bizPost = await db.businessPost.create({
      data: { placeId: place, businessAuthorId: sam.id, body: 'Happy hour 4–7 today' },
    });
    const fanPost = await db.businessPost.create({
      data: { placeId: place, authorId: fan.id, body: 'Is the patio open?' },
    });
    const reply = await db.comment.create({
      data: {
        businessPostId: fanPost.id,
        authorKind: 'BUSINESS',
        authorBusinessId: sam.id,
        body: 'Yes, until 9!',
      },
    });
    await db.businessPost.update({ where: { id: fanPost.id }, data: { commentCount: 1 } });
    await db.notification.create({
      data: {
        userId: fan.id,
        type: 'POST_COMMENT',
        actorBusinessId: sam.id,
        businessPostId: fanPost.id,
        commentId: reply.id,
      },
    });

    const room = await call(roomListPOST as H, 'POST', {
      token: fan.token,
      id: place,
      body: { reading: reading() },
    });
    expect(room.status).toBe(200);
    const shown = room.body.posts.find((p: { id: string }) => p.id === bizPost.id);
    // D189: no picture set, so none shown.
    expect(shown.author).toEqual({
      theOwner: true,
      place: 'Bold Bean',
      staffName: 'Sam',
      avatarUrl: null,
    });
    expect(shown.isMine).toBe(false);

    const detail = await call(bizPostPOST as H, 'POST', {
      token: fan.token,
      id: fanPost.id,
      body: { reading: reading() },
    });
    expect(detail.body.comments[0].author).toEqual({
      theOwner: true,
      place: 'Bold Bean',
      staffName: 'Sam',
      avatarUrl: null,
    });

    const bell = await call(bellGET as H, 'GET', { token: fan.token });
    expect(bell.status).toBe(200);
    const n = bell.body.notifications[0];
    expect(n).toMatchObject({
      type: 'POST_COMMENT',
      actorIsOwner: true,
      actor: null,
      where: 'Bold Bean',
    });

    const everything = JSON.stringify([room.body, detail.body, bell.body]);
    expect(everything).not.toContain('sam.secret');
    expect(everything).not.toContain('owner@boldbean.com');
    expect(everything).not.toContain(sam.id);
  });

  it('the app can reply to a business post, and the business gets no app notification', async () => {
    const bizPost = await db.businessPost.create({
      data: { placeId: place, businessAuthorId: sam.id, body: 'New menu!' },
    });
    const r = await call(bizCommentPOST as H, 'POST', {
      token: fan.token,
      id: bizPost.id,
      body: { reading: reading(), body: 'Looks great' },
    });
    expect(r.status).toBe(201);
    expect(await db.notification.count()).toBe(0);
  });

  it('the database refuses a post with two authors or none, and mismatched comment kinds', async () => {
    await expect(
      db.businessPost.create({ data: { placeId: place, body: 'nobody' } }),
    ).rejects.toThrow();
    await expect(
      db.businessPost.create({
        data: { placeId: place, body: 'both', authorId: fan.id, businessAuthorId: sam.id },
      }),
    ).rejects.toThrow();
    const post = await db.businessPost.create({
      data: { placeId: place, authorId: fan.id, body: 'hi' },
    });
    await expect(
      db.comment.create({
        data: { businessPostId: post.id, authorKind: 'USER', authorBusinessId: sam.id, body: 'x' },
      }),
    ).rejects.toThrow();
    const general = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "GeneralPost" (id, "authorId", body, location, "updatedAt")
      VALUES (uuid_v7(), ${fan.id}::uuid, 'area post',
              ST_SetSRID(ST_MakePoint(-81.686, 30.315), 4326)::geography, now())
      RETURNING id`;
    // A business reply only ever goes on its place's posts, never in the area feed.
    await expect(
      db.comment.create({
        data: {
          generalPostId: general[0]!.id,
          authorKind: 'BUSINESS',
          authorBusinessId: sam.id,
          body: 'x',
        },
      }),
    ).rejects.toThrow();
  });
});
