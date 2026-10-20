import { beforeEach, describe, expect, it } from 'vitest';
import { POST as removalAdminPOST } from '@/app/api/v1/admin/removals/[id]/route';
import { POST as changesPOST } from '@/app/api/v1/places/changes/route';
import { POST as votePOST } from '@/app/api/v1/places/changes/vote/route';
import { POST as removalPOST } from '@/app/api/v1/places/[id]/removal/route';
import { POST as searchPOST } from '@/app/api/v1/places/search/route';
import { POST as submitPOST } from '@/app/api/v1/submissions/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { expirePlaceChanges } from '@/server/directory/place-changes';
import { importOsmPlaces, type OsmElement } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { ACHIEVEMENTS } from '../prisma/seed-data';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D94: community place voting (add and remove), one final vote per person.

const SPOT = { latitude: 30.3149, longitude: -81.6853 }; // where suggestions are made
const NEAR = { latitude: 30.3158, longitude: -81.6853 }; // ~100 m away
const FAR = { latitude: 30.3249, longitude: -81.6853 }; // ~1.1 km: outside 528 yd
const CAFE: OsmElement = {
  type: 'node',
  id: 1,
  lat: 30.315,
  lon: -81.686,
  tags: { amenity: 'cafe', name: 'Old Cafe' },
};
const reading = (p = SPOT) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const DAY = 86_400_000;

type P = { id: string; token: string };
let n = 0;
async function person(opts: { ageDays?: number; verified?: boolean } = {}): Promise<P> {
  const u = await createTestUser(`voter${n++}_v`, {
    emailVerifiedAt: opts.verified === false ? null : new Date(),
    createdAt: new Date(Date.now() - (opts.ageDays ?? 10) * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const people = (k: number) => Promise.all(Array.from({ length: k }, () => person()));

const suggest = (p: P, name: string, at = SPOT) =>
  call(submitPOST as H, 'POST', {
    token: p.token,
    body: { reading: reading(at), name, category: 'cafe' },
  });
const vote = (p: P, kind: 'add' | 'remove', id: string, support: boolean, at = NEAR) =>
  call(votePOST as H, 'POST', {
    token: p.token,
    body: { reading: reading(at), kind, id, support },
  });
const changes = async (p: P, at = NEAR) =>
  (await call(changesPOST as H, 'POST', { token: p.token, body: { reading: reading(at) } })).body
    .changes;
const searchNames = async (p: P) =>
  (
    await call(searchPOST as H, 'POST', { token: p.token, body: { reading: reading() } })
  ).body.places.map((x: { name: string }) => x.name);

let cafeId: string;

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await db.appConfiguration.createMany({
    data: [
      { key: 'rateLimit.submission.perDay', value: 100 },
      { key: 'rateLimit.placeVote.perMinute', value: 1000 },
      { key: 'rateLimit.placeRemoval.perDay', value: 100 },
    ],
  });
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [CAFE]);
  cafeId = (await db.businessPlace.findFirstOrThrow()).id;
  for (const a of ACHIEVEMENTS) {
    await db.achievement.create({
      data: {
        key: a.key,
        name: a.name,
        description: a.description,
        icon: a.icon,
        criteria: a.criteria,
      },
    });
  }
});

describe('adding a place by vote (D94)', () => {
  it('the suggester counts as the first vote; 10 “It’s here” adds it, with the medal', async () => {
    const [sue, ...others] = await people(10);
    const r = await suggest(sue!, 'Bold Bean');
    expect(r.status).toBe(201);
    const [item] = await changes(others[0]!);
    expect(item).toMatchObject({ kind: 'add', name: 'Bold Bean', yes: 1, no: 0, needed: 10 });
    expect(item.myVote).toBeNull();
    // D100: your own request isn't on your strip (your vote is already counted)…
    expect(await changes(sue!)).toEqual([]);
    for (const [i, p] of others.entries()) {
      const v = await vote(p, 'add', item.id, true);
      expect(v.body.outcome).toBe(i === 8 ? 'added' : 'open');
      // …and once you vote, it leaves yours.
      if (i < 8) expect(await changes(p)).toEqual([]);
    }
    expect(await searchNames(sue!)).toContain('Bold Bean');
    const s = await db.businessSubmission.findUniqueOrThrow({ where: { id: item.id } });
    expect(s).toMatchObject({ status: 'APPROVED', decisionReason: 'Added by community vote' });
    expect(await db.userAchievement.count({ where: { userId: sue!.id } })).toBe(1);
    expect(await changes(sue!)).toEqual([]); // decided: off the strip
  });

  it('10 “Not here” drops it', async () => {
    const [sue] = await people(1);
    await suggest(sue!, 'Phantom Pizza');
    const id = (await db.businessSubmission.findFirstOrThrow()).id;
    for (const p of await people(10)) await vote(p, 'add', id, false);
    expect((await db.businessSubmission.findUniqueOrThrow({ where: { id } })).status).toBe(
      'REJECTED',
    );
  });

  // 🔒 One final vote each.
  it('you can vote only once and can’t change it', async () => {
    const [sue, ann] = await people(2);
    await suggest(sue!, 'Bold Bean');
    const id = (await db.businessSubmission.findFirstOrThrow()).id;
    expect((await vote(ann!, 'add', id, true)).status).toBe(200);
    expect((await vote(ann!, 'add', id, false)).body.error.code).toBe('ALREADY_VOTED');
    expect((await vote(sue!, 'add', id, true)).body.error.code).toBe('ALREADY_VOTED');
    expect(await db.placeChangeVote.count()).toBe(2);
  });

  // 🔒 Only nearby, confirmed accounts a few days old.
  it('refuses far away, new or unconfirmed voters', async () => {
    const [sue] = await people(1);
    await suggest(sue!, 'Bold Bean');
    const id = (await db.businessSubmission.findFirstOrThrow()).id;
    const far = await vote(await person(), 'add', id, true, FAR);
    expect(far.status).toBe(403);
    expect((await vote(await person({ ageDays: 1 }), 'add', id, true)).body.error.code).toBe(
      'ACCOUNT_TOO_NEW',
    );
    expect((await vote(await person({ verified: false }), 'add', id, true)).status).toBe(403);
    expect(await db.placeChangeVote.count()).toBe(1); // only the suggester's
  });

  it('a second suggestion of the same place nearby counts as a vote, not a new entry', async () => {
    const [sue, ann] = await people(2);
    await suggest(sue!, 'Bold Bean Coffee');
    const r = await suggest(ann!, 'Bold Bean Cofee', NEAR); // typo, ~100 m… too far to merge
    expect(r.body.merged).toBe(false);
    const [bob] = await people(1);
    const m = await suggest(bob!, 'bold bean coffee', {
      ...SPOT,
      latitude: SPOT.latitude + 0.0002,
    });
    expect(m.body.merged).toBe(true);
    const first = await db.businessSubmission.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
    expect(m.body.id).toBe(first.id);
    expect(await db.placeChangeVote.count({ where: { submissionId: first.id } })).toBe(2);
  });

  it('ten people voting at the same moment add it exactly once', async () => {
    const [sue] = await people(1);
    await suggest(sue!, 'Rush Hour Cafe');
    const id = (await db.businessSubmission.findFirstOrThrow()).id;
    const results = await Promise.all((await people(12)).map((p) => vote(p, 'add', id, true)));
    expect(results.filter((r) => r.body.outcome === 'added')).toHaveLength(1);
    expect(await db.businessPlace.count({ where: { name: 'Rush Hour Cafe' } })).toBe(1);
  });
});

describe('removing a place by vote (D94)', () => {
  it('10 “Closed” takes it down; it stays down after a map re-import; an admin can restore it', async () => {
    const [ann, ...others] = await people(10);
    const r = await call(removalPOST as H, 'POST', {
      token: ann!.token,
      id: cafeId,
      body: { reading: reading(NEAR) },
    });
    expect(r.status).toBe(201);
    expect((await changes(others[0]!))[0]).toMatchObject({
      kind: 'remove',
      name: 'Old Cafe',
      yes: 1,
    });
    for (const p of others) await vote(p, 'remove', r.body.id, true);
    expect(await searchNames(ann!)).not.toContain('Old Cafe');
    await importOsmPlaces(db, [CAFE]); // the map still lists it
    expect((await db.businessPlace.findUniqueOrThrow({ where: { id: cafeId } })).status).toBe(
      'REMOVED',
    );
    const admin = await adminHeaders((await createTestUser('mod_v', { role: 'ADMIN' })).id);
    const k = await call(removalAdminPOST as H, 'POST', {
      headers: admin,
      params: { id: r.body.id },
      body: { action: 'keep' },
    });
    expect(k.status).toBe(200);
    expect(await searchNames(ann!)).toContain('Old Cafe');
  });

  it('10 “Still open” keeps it; asking again joins the open request', async () => {
    const [ann, bob] = await people(2);
    const ask = (p: P) =>
      call(removalPOST as H, 'POST', {
        token: p.token,
        id: cafeId,
        body: { reading: reading(NEAR) },
      });
    const first = await ask(ann!);
    const second = await ask(bob!);
    expect(second.body.id).toBe(first.body.id);
    for (const p of await people(10)) await vote(p, 'remove', first.body.id, false);
    expect((await db.placeRemoval.findUniqueOrThrow({ where: { id: first.body.id } })).status).toBe(
      'KEPT',
    );
    expect(await searchNames(ann!)).toContain('Old Cafe');
  });

  it('asking needs you near the place', async () => {
    const r = await call(removalPOST as H, 'POST', {
      token: (await person()).token,
      id: cafeId,
      body: { reading: reading(FAR) },
    });
    expect(r.status).toBe(403);
  });
});

describe('expiry (D94)', () => {
  it('changes undecided after 60 days expire and leave the strip', async () => {
    const [sue, ann] = await people(2);
    await suggest(sue!, 'Slow Spot');
    await call(removalPOST as H, 'POST', {
      token: ann!.token,
      id: cafeId,
      body: { reading: reading(NEAR) },
    });
    await db.businessSubmission.updateMany({
      data: { createdAt: new Date(Date.now() - 61 * DAY) },
    });
    await db.placeRemoval.updateMany({ data: { createdAt: new Date(Date.now() - 61 * DAY) } });
    expect(await expirePlaceChanges()).toBe(2);
    expect(await changes(ann!)).toEqual([]);
    expect((await db.businessSubmission.findFirstOrThrow()).status).toBe('EXPIRED');
  });
});
