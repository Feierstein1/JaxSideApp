import { beforeEach, describe, expect, it } from 'vitest';
import { POST as approvalPOST } from '@/app/api/v1/admin/topics/approval/route';
import { POST as pagePOST } from '@/app/api/v1/topics/list/route';
import { POST as createPOST } from '@/app/api/v1/topics/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { invalidateScreeningCache } from '@/server/moderation/screening';
import { decideTopic, mySuggestions } from '@/server/topics';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D222: topics people start wait for an admin, unless the admin has switched approval off.
const DAY = 86_400_000;
const AT = { latitude: 30.3274, longitude: -81.6588 };
const reading = () => ({ ...AT, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

type Person = { id: string; token: string };
async function person(name: string, extra: object = {}): Promise<Person> {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
    ...extra,
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const create = (p: Person, scope: 'city' | 'local', title: string) =>
  call(createPOST as H, 'POST', { token: p.token, body: { reading: reading(), scope, title } });
const listed = async (p: Person) =>
  (
    (
      await call(pagePOST as H, 'POST', {
        token: p.token,
        body: { reading: reading(), scope: 'city' },
      })
    ).body.topics as { title: string }[]
  ).map((t) => t.title);

let me: Person;
let other: Person;
let admin: Person;

beforeEach(async () => {
  await resetDb(); // no setting stored: approval is on by default
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  invalidateScreeningCache();
  me = await person('ta_me');
  other = await person('ta_other');
  admin = await person('ta_admin', { role: 'ADMIN' });
}, 60_000);

describe('topics wait for an admin (D222)', () => {
  it('a new topic is saved as waiting, hidden from everyone, and the person is told', async () => {
    const r = await create(me, 'city', 'Best tacos in Riverside');
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ held: true, pending: true });
    expect(r.body.message).toMatch(/admin will look/i);
    const row = await db.cityTopic.findFirstOrThrow({
      where: { title: 'Best tacos in Riverside' },
    });
    expect(row).toMatchObject({ status: 'SUGGESTED', createdById: me.id, suggestedById: me.id });
    expect(await listed(other)).toEqual([]);
    expect(await listed(me)).toEqual([]);
    expect((await mySuggestions(me.id))[0]).toMatchObject({ title: row.title, status: 'waiting' });
  });

  it('still uses up the waiting period between topics', async () => {
    expect((await create(me, 'city', 'First idea')).status).toBe(202);
    const again = await create(me, 'city', 'Second idea');
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe('TOPIC_LIMIT');
  });

  it('approving shows it to everyone; rejecting tells the person why', async () => {
    await create(me, 'city', 'Approve me');
    await create(other, 'city', 'Reject me');
    const a = await db.cityTopic.findFirstOrThrow({ where: { title: 'Approve me' } });
    const b = await db.cityTopic.findFirstOrThrow({ where: { title: 'Reject me' } });
    await decideTopic(a.id, { action: 'approve' });
    await decideTopic(b.id, { action: 'reject', reason: 'Not about Jacksonville' });
    expect(await listed(other)).toEqual(['Approve me']);
    expect((await mySuggestions(me.id))[0]).toMatchObject({ status: 'approved' });
    expect((await mySuggestions(other.id))[0]).toMatchObject({
      status: 'rejected',
      reason: 'Not about Jacksonville',
    });
  });

  it('a Near me topic keeps its place when approved', async () => {
    await create(me, 'local', 'Block party');
    const t = await db.cityTopic.findFirstOrThrow({ where: { title: 'Block party' } });
    expect(t.scope).toBe('LOCAL');
    await decideTopic(t.id, { action: 'approve' });
    const after = await db.cityTopic.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toMatchObject({ status: 'ACTIVE', scope: 'LOCAL' });
  });

  it('staff are never held', async () => {
    const staff = await person('ta_staff', { staffBadge: true });
    expect((await create(staff, 'city', 'Staff topic')).status).toBe(201);
    expect((await create(admin, 'local', 'Admin topic')).status).toBe(201);
  });

  it('a topic caught by the word rules is held for review, not just waiting', async () => {
    await db.screeningRule.create({
      data: { term: 'crypto giveaway', action: 'HOLD', match: 'WORD', category: 'SPAM' },
    });
    invalidateScreeningCache();
    const r = await create(me, 'city', 'Crypto giveaway for Jacksonville');
    expect(r.status).toBe(202);
    expect(r.body.pending).toBeUndefined();
    const t = await db.cityTopic.findFirstOrThrow();
    expect(t.status).toBe('HELD');
    expect(t.suggestedById).toBeNull();
  });
});

describe('the admin switch', () => {
  const flip = async (required: boolean, as = admin) =>
    call(approvalPOST as H, 'POST', {
      body: { required, reason: 'testing the switch' },
      headers: await adminHeaders(as.id),
    });

  it('off lets topics appear at once; on makes them wait again; each change is audited', async () => {
    expect((await flip(false)).status).toBe(200);
    expect((await create(me, 'city', 'Appears right away')).status).toBe(201);
    expect(await listed(other)).toEqual(['Appears right away']);

    expect((await flip(true)).status).toBe(200);
    expect((await create(other, 'city', 'Waits again')).status).toBe(202);
    expect(await listed(me)).toEqual(['Appears right away']);

    expect(await db.adminAuditLog.count({ where: { action: 'TOPIC_APPROVAL_OFF' } })).toBe(1);
    expect(await db.adminAuditLog.count({ where: { action: 'TOPIC_APPROVAL_ON' } })).toBe(1);
  });

  it('topics already waiting stay waiting when approval is switched off', async () => {
    await create(me, 'city', 'Still waiting');
    await flip(false);
    expect((await db.cityTopic.findFirstOrThrow()).status).toBe('SUGGESTED');
  });

  // 🔒 Only admins.
  it('refuses a regular user', async () => {
    const r = await call(approvalPOST as H, 'POST', {
      token: me.token,
      body: { required: false, reason: 'let me in' },
    });
    expect(r.status).toBeGreaterThanOrEqual(401);
    expect((await create(me, 'city', 'Still waits')).status).toBe(202);
  });
});
