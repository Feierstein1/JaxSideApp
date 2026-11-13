import { beforeEach, describe, expect, it } from 'vitest';
import { GET as badgesGET } from '@/app/api/v1/badges/route';
import { POST as requestPOST } from '@/app/api/v1/friends/requests/route';
import { POST as sendPOST } from '@/app/api/v1/messages/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { pair } from '@/server/social/friends';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// Q26: both top-bar badges in one request.

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const DAY = 86_400_000;

type P = { id: string; token: string };
async function person(name: string): Promise<P> {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const badges = (p: P) => call(badgesGET as H, 'GET', { token: p.token });

let ann: P;
let bob: P;
let cat: P;
beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  ann = await person('ann_b');
  bob = await person('bob_b');
  cat = await person('cat_b');
  await db.friendship.create({
    data: { ...pair(ann.id, bob.id), requesterId: ann.id, status: 'ACCEPTED' },
  });
});

describe('badges (Q26)', () => {
  it('counts unread chats and bell notices together, for that person only', async () => {
    expect((await badges(bob)).body).toEqual({ messages: 0, notifications: 0, eventsToday: 0 });
    await call(sendPOST as H, 'POST', {
      token: ann.token,
      body: { reading: reading(), to: 'bob_b', body: 'Hi Bob' },
    });
    await call(requestPOST as H, 'POST', { token: cat.token, body: { username: 'bob_b' } });
    expect((await badges(bob)).body).toEqual({ messages: 1, notifications: 1, eventsToday: 0 });
    expect((await badges(ann)).body).toEqual({ messages: 0, notifications: 0, eventsToday: 0 });
  });

  // 🔒 Signed-in accounts only.
  it('refuses a request without a session', async () => {
    expect((await call(badgesGET as H, 'GET', {})).status).toBe(401);
    expect((await call(badgesGET as H, 'GET', { token: 'x'.repeat(43) })).status).toBe(401);
  });
});
