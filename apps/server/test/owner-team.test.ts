import { beforeEach, describe, expect, it } from 'vitest';
import { POST as bizCommentPOST } from '@/app/api/v1/business-posts/[id]/comments/route';
import { POST as bizPostPOST } from '@/app/api/v1/business-posts/[id]/route';
import { GET as activityGET } from '@/app/api/v1/friends/activity/route';
import { GET as bellGET } from '@/app/api/v1/notifications/route';
import {
  DELETE as memberDELETE,
  PATCH as memberPATCH,
} from '@/app/api/v1/places/[id]/owner-team/[claimId]/route';
import { GET as teamGET, POST as teamPOST } from '@/app/api/v1/places/[id]/owner-team/route';
import { POST as roomListPOST } from '@/app/api/v1/places/[id]/posts/list/route';
import { POST as roomPostPOST } from '@/app/api/v1/places/[id]/posts/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { decideOwnerClaim } from '@/server/directory/owners';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { pair } from '@/server/social/friends';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D157: "The Owner": a place's owner team posts and comments in its discussion without
// usernames; one primary owner manages the team.

const DAY = 86_400_000;
const HERE = { latitude: 30.3151, longitude: -81.686 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

type P = { id: string; token: string; name: string };
async function person(name: string): Promise<P> {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token, name };
}

let place: string;
let owner: P; // primary
let staff: P;
let fan: P;
let adminId: string;

const team = (p: P) => call(teamGET as H, 'GET', { token: p.token, id: place });
const addMember = (p: P, username: string, staffName?: string) =>
  call(teamPOST as H, 'POST', {
    token: p.token,
    id: place,
    body: { username, ...(staffName ? { staffName } : {}) },
  });
const roomPost = async (p: P, body: string) =>
  (
    await call(roomPostPOST as H, 'POST', {
      token: p.token,
      id: place,
      body: { reading: reading(), body },
    })
  ).body.post as { id: string; author: Record<string, unknown> };

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
  owner = await person('owner_t');
  staff = await person('staff_t');
  fan = await person('fan_t');
  adminId = (await createTestUser('admin_t', { role: 'ADMIN' })).id;
  // The first owner is verified the usual way (an admin approves the claim).
  const claim = await db.ownerClaim.create({
    data: { placeId: place, userId: owner.id, method: 'PHONE', status: 'PENDING' },
  });
  await decideOwnerClaim(adminId, claim.id, 'approve', undefined);
}, 60_000);

describe('the primary owner and the team (D157)', () => {
  it('the first verified owner is primary and adds, renames and removes team members', async () => {
    expect((await db.ownerClaim.findFirstOrThrow({ where: { userId: owner.id } })).primary).toBe(
      true,
    );
    expect((await addMember(owner, 'staff_t', 'Sarah')).status).toBe(201);
    const list = (await team(staff)).body.team as {
      claimId: string;
      username: string;
      staffName: string | null;
      primary: boolean;
    }[];
    expect(list.map((m) => [m.username, m.staffName, m.primary])).toEqual([
      ['owner_t', null, true],
      ['staff_t', 'Sarah', false],
    ]);
    expect((await addMember(owner, 'staff_t')).body.error.code).toBe('ALREADY_OWNER');

    const mine = list.find((m) => m.username === 'staff_t')!;
    const rename = await call(memberPATCH as H, 'PATCH', {
      token: staff.token,
      params: { id: place, claimId: mine.claimId },
      body: { staffName: 'Sarah, manager' },
    });
    expect(rename.status).toBe(200); // a member can rename themselves

    const removed = await call(memberDELETE as H, 'DELETE', {
      token: owner.token,
      params: { id: place, claimId: mine.claimId },
    });
    expect(removed.status).toBe(200);
    expect((await team(staff)).status).toBe(403); // no longer on the team
  });

  // 🔒 Only the primary manages the team; only owners see it.
  it('refuses team changes by anyone but the primary owner', async () => {
    await addMember(owner, 'staff_t');
    expect((await addMember(staff, 'fan_t')).body.error.code).toBe('NOT_PRIMARY_OWNER');
    expect((await team(fan)).status).toBe(403);
    const primary = (await team(owner)).body.team[0].claimId as string;
    const self = await call(memberDELETE as H, 'DELETE', {
      token: owner.token,
      params: { id: place, claimId: primary },
    });
    expect(self.body.error.code).toBe('PRIMARY');
  });

  it('an admin can move the primary role to another owner', async () => {
    await addMember(owner, 'staff_t');
    const claim = await db.ownerClaim.findFirstOrThrow({ where: { userId: staff.id } });
    await decideOwnerClaim(adminId, claim.id, 'make-primary', undefined);
    expect((await addMember(staff, 'fan_t')).status).toBe(201);
    expect((await addMember(owner, 'fan_t')).body.error.code).toBe('NOT_PRIMARY_OWNER');
  });
});

describe('posting as The Owner (D157)', () => {
  // 🔒 Nobody else ever receives an owner's username for their place's posts.
  it('shows owner posts and comments as The Owner, with the staff name, never the username', async () => {
    await addMember(owner, 'staff_t', 'Sarah');
    const p = await roomPost(owner, 'Happy hour starts at 4 today!');
    expect(p.author).toEqual({ theOwner: true, place: 'Bold Bean', staffName: null });

    const fanPost = await roomPost(fan, 'Is the patio open?');
    await call(bizCommentPOST as H, 'POST', {
      token: staff.token,
      id: fanPost.id,
      body: { reading: reading(), body: 'Yes, until 9!' },
    });
    const detail = await call(bizPostPOST as H, 'POST', {
      token: fan.token,
      id: fanPost.id,
      body: { reading: reading() },
    });
    expect(detail.body.comments[0].author).toEqual({
      theOwner: true,
      place: 'Bold Bean',
      staffName: 'Sarah',
    });
    const room = await call(roomListPOST as H, 'POST', {
      token: fan.token,
      id: place,
      body: { reading: reading() },
    });
    const everything = JSON.stringify([room.body, detail.body]);
    expect(everything).not.toContain('owner_t');
    expect(everything).not.toContain('staff_t');

    // The fan's bell: "The Owner" commented, no username.
    const bell = (await call(bellGET as H, 'GET', { token: fan.token })).body.notifications;
    expect(bell[0]).toMatchObject({ type: 'POST_COMMENT', actorIsOwner: true, actor: null });
    expect(JSON.stringify(bell)).not.toContain('staff_t');
  });

  // 🔒 Answering The Owner's reply doesn't add "@username" (D105's automatic tag).
  it('never tags an owner by username when someone answers them', async () => {
    const fanPost = await roomPost(fan, 'Do you have oat milk?');
    const top = (
      await call(bizCommentPOST as H, 'POST', {
        token: fan.token,
        id: fanPost.id,
        body: { reading: reading(), body: 'Asking for a friend' },
      })
    ).body.id as string;
    const ownerReply = (
      await call(bizCommentPOST as H, 'POST', {
        token: owner.token,
        id: fanPost.id,
        body: { reading: reading(), body: 'We do!', parentCommentId: top },
      })
    ).body.id as string;
    await call(bizCommentPOST as H, 'POST', {
      token: fan.token,
      id: fanPost.id,
      body: { reading: reading(), body: 'Thanks!', parentCommentId: ownerReply },
    });
    const bodies = (await db.comment.findMany({ select: { body: true } })).map((c) => c.body);
    expect(bodies).toContain('Thanks!');
    expect(bodies.join(' ')).not.toContain('owner_t');
  });

  it('keeps owners as themselves outside their place, and out of friends’ activity there', async () => {
    await db.friendship.create({
      data: { ...pair(owner.id, fan.id), requesterId: owner.id, status: 'ACCEPTED' },
    });
    await roomPost(owner, 'New menu out now');
    const area = await call(postsPOST as H, 'POST', {
      token: owner.token,
      body: { reading: reading(), body: 'Nice day in Riverside' },
    });
    expect(area.body.post.author).toMatchObject({ username: 'owner_t' });
    const feed = (await call(activityGET as H, 'GET', { token: fan.token })).body.items as {
      kind: string;
    }[];
    expect(feed.map((i) => i.kind)).toEqual(['general']); // the place post isn't listed
  });
});
