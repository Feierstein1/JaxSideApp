import { beforeEach, describe, expect, it } from 'vitest';
import { GET as auditGET } from '@/app/api/v1/admin/audit/route';
import { GET as appealsGET } from '@/app/api/v1/admin/appeals/route';
import { POST as appealDecidePOST } from '@/app/api/v1/admin/appeals/[id]/route';
import { GET as casesGET } from '@/app/api/v1/admin/cases/route';
import { GET as caseGET, POST as caseDecidePOST } from '@/app/api/v1/admin/cases/[type]/[id]/route';
import { GET as usersGET } from '@/app/api/v1/admin/users/route';
import { GET as userGET } from '@/app/api/v1/admin/users/[id]/route';
import { POST as userActionPOST } from '@/app/api/v1/admin/users/[id]/actions/route';
import { GET as myReportsGET } from '@/app/api/v1/me/reports/route';
import { GET as bellGET } from '@/app/api/v1/notifications/route';
import { GET as unreadGET } from '@/app/api/v1/notifications/unread/route';
import { POST as meAppealsPOST } from '@/app/api/v1/me/appeals/route';
import { GET as standingGET } from '@/app/api/v1/me/standing/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { POST as roomPostPOST } from '@/app/api/v1/places/[id]/posts/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { invalidateScreeningCache } from '@/server/moderation/screening';
import { listNotifications } from '@/server/social/notifications';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let admin: Record<string, string>;
let adminId: string;
let alice: string; // author
let aliceId: string;
let bob: string; // reporter
let carol: string; // reporter
let placeId: string;

async function token(username: string) {
  const u = await createTestUser(username, { emailVerifiedAt: new Date() });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const newPost = async (body: string) =>
  (await call(postsPOST as H, 'POST', { token: alice, body: { reading: reading(), body } })).body
    .post.id as string;
const report = (t: string, target: unknown, reason = 'HARASSMENT') =>
  call(reportPOST as H, 'POST', { token: t, body: { reading: reading(), target, reason } });
const decide = (type: string, id: string, body: Record<string, unknown>) =>
  call(caseDecidePOST as H, 'POST', { headers: admin, params: { type, id }, body });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  invalidateScreeningCache();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    { type: 'node', id: 1, lat: 30.315, lon: -81.686, tags: { amenity: 'cafe', name: 'Cafe Q' } },
  ]);
  placeId = (await db.businessPlace.findFirstOrThrow()).id;
  adminId = (await createTestUser('mod_q', { role: 'ADMIN' })).id;
  admin = await adminHeaders(adminId);
  ({ id: aliceId, token: alice } = await token('alice_q'));
  bob = (await token('bob_q')).token;
  carol = (await token('carol_q')).token;
  await db.appConfiguration.create({ data: { key: 'rateLimit.post.perMinute', value: 100 } });
});

describe('the queue (P5.14)', () => {
  it('groups reports into one case per item, most urgent first', async () => {
    const mild = await newPost('a post some find annoying');
    const scary = await newPost('a post that reads like a threat');
    await report(bob, { type: 'general', id: mild }, 'SPAM');
    await report(carol, { type: 'general', id: mild }, 'HARASSMENT');
    await report(bob, { type: 'general', id: scary }, 'THREAT');
    const r = await call(casesGET as H, 'GET', { headers: admin });
    expect(r.status).toBe(200);
    expect(r.body.cases.map((c: { id: string }) => c.id)).toEqual([scary, mild]);
    expect(r.body.cases[1]).toMatchObject({
      type: 'general',
      reportCount: 2,
      reasons: expect.arrayContaining(['SPAM', 'HARASSMENT']),
      author: { username: 'alice_q' },
      contentStatus: 'VISIBLE',
    });
  });

  it('a case shows who reported (or "automatic screening") and the author history', async () => {
    const id = await newPost('hello there neighbors');
    await report(bob, { type: 'general', id });
    await db.report.create({ data: { generalPostId: id, reason: 'SPAM', details: 'auto' } });
    const r = await call(caseGET as H, 'GET', { headers: admin, params: { type: 'general', id } });
    expect(r.status).toBe(200);
    expect(r.body.reports.map((x: { reporter: string }) => x.reporter).sort()).toEqual([
      '@bob_q',
      'automatic screening',
    ]);
    expect(r.body.authorHistory).toMatchObject({ reportsAgainst: 2, contentRemoved: 0 });
    // Never the author's email, even for admins (reveal-with-reason is P5.18).
    expect(r.raw).not.toMatch(/@example\.test|emailEnc|passwordHash/);
  });
});

describe('decisions (P5.14, P5.15, P5.16, ✅MS3)', () => {
  it('remove: hidden, reports closed, recorded, audited; optional strike', async () => {
    const id = await newPost('rude post here today');
    await report(bob, { type: 'general', id });
    const r = await decide('general', id, {
      decision: 'remove',
      reason: 'Harassment',
      internalNote: 'clear case',
      strike: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.strike).toMatchObject({ action: 'WARN', strike: 1 });
    expect((await db.generalPost.findUniqueOrThrow({ where: { id } })).status).toBe('REMOVED');
    expect(await db.report.findFirstOrThrow()).toMatchObject({
      status: 'ACTIONED',
      resolvedById: adminId,
    });
    expect(
      await db.moderationAction.findFirstOrThrow({ where: { action: 'REMOVE_CONTENT' } }),
    ).toMatchObject({
      adminId,
      generalPostId: id,
      targetUserId: aliceId,
      internalNote: 'clear case',
    });
    const log = await call(auditGET as H, 'GET', { headers: admin });
    expect(log.body.entries.map((e: { action: string }) => e.action)).toEqual([
      'STRIKE_WARN',
      'CASE_REMOVE',
    ]);
    // The author sees the warning; the reporter sees "action taken".
    const standing = await call(standingGET as H, 'GET', { token: alice });
    expect(standing.body.strikes[0]).toMatchObject({ action: 'WARN', reason: 'Harassment' });
    const mine = await call(myReportsGET as H, 'GET', { token: bob });
    expect(mine.body.reports[0].status).toBe('ACTIONED');
  });

  it('dismiss: content stays, reports closed as no action', async () => {
    const id = await newPost('a perfectly fine post');
    await report(bob, { type: 'general', id });
    expect((await decide('general', id, { decision: 'dismiss', reason: 'Fine' })).status).toBe(200);
    expect((await db.generalPost.findUniqueOrThrow({ where: { id } })).status).toBe('VISIBLE');
    expect((await db.report.findFirstOrThrow()).status).toBe('DISMISSED');
  });

  it('D196: remove and dismiss need no reason; the author sees a standard one on a strike', async () => {
    const id = await newPost('rude post here today');
    await report(bob, { type: 'general', id });
    const r = await decide('general', id, { decision: 'remove', reason: '', strike: true });
    expect(r.status).toBe(200);
    expect(
      await db.moderationAction.findFirstOrThrow({ where: { action: 'REMOVE_CONTENT' } }),
    ).toMatchObject({ reason: 'Broke the Community Guidelines', internalNote: null });
    const standing = await call(standingGET as H, 'GET', { token: alice });
    expect(standing.body.strikes[0]).toMatchObject({
      action: 'WARN',
      reason: 'Broke the Community Guidelines',
    });

    const fine = await newPost('a perfectly fine post');
    await report(bob, { type: 'general', id: fine });
    expect((await decide('general', fine, { decision: 'dismiss' })).status).toBe(200);
    expect((await db.report.findFirstOrThrow({ where: { generalPostId: fine } })).status).toBe(
      'DISMISSED',
    );
  });

  it('D196: a child-safety escalation still needs a reason', async () => {
    const id = await newPost('something to escalate');
    await report(bob, { type: 'general', id });
    expect((await decide('general', id, { decision: 'escalate' })).status).toBe(400);
    expect((await db.generalPost.findUniqueOrThrow({ where: { id } })).status).toBe('VISIBLE');
  });

  it('approve: held content goes live and is counted', async () => {
    const postId = await newPost('a calm post to reply to');
    await db.screeningRule.create({
      data: { term: 'i know where you live', action: 'HOLD', category: 'THREAT' },
    });
    invalidateScreeningCache();
    const held = await call(commentPOST as H, 'POST', {
      token: bob,
      id: postId,
      body: { reading: reading(), body: 'lol i know where you live (it is the song title)' },
    });
    expect(held.status).toBe(202);
    const c = await db.comment.findFirstOrThrow();
    expect((await call(casesGET as H, 'GET', { headers: admin })).body.cases[0]).toMatchObject({
      type: 'comment',
      automatic: true,
      contentStatus: 'HELD_FOR_REVIEW',
    });
    await decide('comment', c.id, { decision: 'approve', reason: 'Song lyric, fine' });
    expect((await db.comment.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('VISIBLE');
    expect((await db.generalPost.findUniqueOrThrow({ where: { id: postId } })).commentCount).toBe(
      1,
    );
  });

  it('removing a room post or comment keeps the counts right', async () => {
    const roomPost = (
      await call(roomPostPOST as H, 'POST', {
        token: alice,
        id: placeId,
        body: { reading: reading(), body: 'room post to remove' },
      })
    ).body.post.id;
    expect((await db.businessPlace.findUniqueOrThrow({ where: { id: placeId } })).postCount).toBe(
      1,
    );
    await report(bob, { type: 'business', id: roomPost });
    await decide('business', roomPost, { decision: 'remove', reason: 'Spam' });
    expect((await db.businessPlace.findUniqueOrThrow({ where: { id: placeId } })).postCount).toBe(
      0,
    );

    const postId = await newPost('post with a bad comment');
    const commentId = (
      await call(commentPOST as H, 'POST', {
        token: carol,
        id: postId,
        body: { reading: reading(), body: 'a nasty comment here' },
      })
    ).body.id;
    await report(bob, { type: 'comment', id: commentId });
    await decide('comment', commentId, { decision: 'remove', reason: 'Harassment' });
    expect((await db.generalPost.findUniqueOrThrow({ where: { id: postId } })).commentCount).toBe(
      0,
    );
    // Restoring brings it back and counts it again.
    await decide('comment', commentId, { decision: 'approve', reason: 'Misjudged' });
    expect((await db.generalPost.findUniqueOrThrow({ where: { id: postId } })).commentCount).toBe(
      1,
    );
  });

  it('child-safety escalation hides it, preserves it, and puts the author on legal hold', async () => {
    const id = await newPost('content needing escalation');
    await report(bob, { type: 'general', id }, 'CHILD_SAFETY');
    await decide('general', id, { decision: 'escalate', reason: 'Reported to NCMEC' });
    expect((await db.generalPost.findUniqueOrThrow({ where: { id } })).status).toBe('REMOVED');
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: aliceId } })).legalHoldAt,
    ).not.toBeNull();
    expect(await db.adminAuditLog.count({ where: { action: 'CHILD_SAFETY_ESCALATED' } })).toBe(1);
  });

  it('refuses nonsense: profile removal, content the author deleted, bad input', async () => {
    await report(bob, { type: 'user', username: 'alice_q' });
    expect((await decide('user', aliceId, { decision: 'remove', reason: 'x y z' })).status).toBe(
      400,
    );
    const id = await newPost('soon to be deleted by author');
    await report(bob, { type: 'general', id });
    await db.generalPost.update({ where: { id }, data: { status: 'DELETED' } });
    expect((await decide('general', id, { decision: 'remove', reason: 'late' })).status).toBe(409);
    expect((await decide('general', id, { decision: 'nuke', reason: 'x' })).status).toBe(400);
    expect((await decide('nope', id, { decision: 'dismiss', reason: 'xyz' })).status).toBe(404);
  });
});

describe('user tools (P5.6, P5.14)', () => {
  it('search, record, suspend and cancel a strike, all audited', async () => {
    const none = await call(usersGET as H, 'GET', { headers: admin });
    expect(none.body.users).toEqual([]);
    const found = await call(usersGET as H, 'GET', {
      headers: admin,
      query: { q: '@ALI', filter: 'all' },
    });
    expect(found.body.users.map((u: { username: string }) => u.username)).toEqual(['alice_q']);
    const act = (body: Record<string, unknown>) =>
      call(userActionPOST as H, 'POST', { headers: admin, params: { id: aliceId }, body });
    expect((await act({ action: 'suspend', hours: 48, reason: 'Repeated spam' })).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: aliceId } })).status).toBe('SUSPENDED');
    const rec = await call(userGET as H, 'GET', { headers: admin, params: { id: aliceId } });
    expect(rec.body).toMatchObject({ username: 'alice_q', status: 'SUSPENDED' });
    const strikeId = rec.body.history.actions[0].id;
    expect((await act({ action: 'void', strikeId, reason: 'Wrong person' })).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: aliceId } })).status).toBe('ACTIVE');
    expect((await act({ action: 'suspend', hours: 0, reason: 'x y z' })).status).toBe(400);
    expect(
      (
        await act({
          action: 'void',
          strikeId: '00000000-0000-7000-8000-000000000000',
          reason: 'nope',
        })
      ).status,
    ).toBe(404);
    const log = await call(auditGET as H, 'GET', { headers: admin });
    expect(log.body.entries.map((e: { action: string }) => e.action)).toEqual([
      'USER_VOID',
      'USER_SUSPEND',
    ]);
  });

  it('appeals: list and decide from the portal', async () => {
    await call(userActionPOST as H, 'POST', {
      headers: admin,
      params: { id: aliceId },
      body: { action: 'strike', reason: 'Spam' },
    });
    const strikeId = (await db.moderationAction.findFirstOrThrow()).id;
    await call(meAppealsPOST as H, 'POST', {
      token: alice,
      body: { actionId: strikeId, message: 'Those were real event links.' },
    });
    const list = await call(appealsGET as H, 'GET', { headers: admin });
    expect(list.body.appeals).toHaveLength(1);
    const appealId = list.body.appeals[0].id;
    const r = await call(appealDecidePOST as H, 'POST', {
      headers: admin,
      params: { id: appealId },
      body: { accept: true, note: 'Checked, they were real.' },
    });
    expect(r.status).toBe(200);
    expect((await call(standingGET as H, 'GET', { token: alice })).body.strikes).toHaveLength(0);
  });
});

describe('D205: telling the person', () => {
  const bell = async (t: string) =>
    (await call(bellGET as H, 'GET', { token: t })).body.notifications as {
      type: string;
      actor: unknown;
      target: unknown;
      moderation: Record<string, unknown> | null;
    }[];

  it('a removal tells the author only when asked, with the reason and never the note', async () => {
    const quiet = await newPost('removed without a word');
    await report(bob, { type: 'general', id: quiet });
    await decide('general', quiet, { decision: 'remove', reason: 'Spam' });
    expect(await bell(alice)).toEqual([]);

    const told = await newPost('removed and told');
    await report(bob, { type: 'general', id: told });
    const r = await decide('general', told, {
      decision: 'remove',
      reason: 'Personal attack',
      internalNote: 'secret admin note',
      notifyAuthor: true,
    });
    expect(r.status).toBe(200);
    const items = await bell(alice);
    expect(items).toEqual([
      expect.objectContaining({
        type: 'CONTENT_REMOVED',
        actor: null,
        target: null,
        moderation: { step: null, hours: null, what: 'post', reason: 'Personal attack' },
      }),
    ]);
    expect(JSON.stringify(items)).not.toContain('secret admin note');
    expect((await call(unreadGET as H, 'GET', { token: alice })).body).toMatchObject({ unread: 1 });
  });

  it('only a removal can notify', async () => {
    const id = await newPost('a fine post');
    await report(bob, { type: 'general', id });
    expect((await decide('general', id, { decision: 'dismiss', notifyAuthor: true })).status).toBe(
      400,
    );
    expect(await db.notification.count()).toBe(0);
  });

  it('every strike is in the bell; cancelling it takes the notice away', async () => {
    const id = await newPost('rude post again');
    await report(bob, { type: 'general', id });
    await decide('general', id, { decision: 'remove', strike: true, notifyAuthor: true });
    const act = (body: Record<string, unknown>) =>
      call(userActionPOST as H, 'POST', { headers: admin, params: { id: aliceId }, body });
    expect((await act({ action: 'suspend', hours: 48, reason: 'Threats' })).status).toBe(200);
    // Suspended, so read the list directly (they see it when the suspension ends).
    const items = await listNotifications(aliceId);
    // The removal and its warning share one moment, so their order isn't fixed.
    expect(items).toHaveLength(3);
    expect(items.map((n) => [n.type, n.moderation])).toEqual(
      expect.arrayContaining([
        ['STRIKE', { step: 'SUSPEND', hours: 48, what: null, reason: 'Threats' }],
        [
          'STRIKE',
          { step: 'WARN', hours: null, what: null, reason: 'Broke the Community Guidelines' },
        ],
        [
          'CONTENT_REMOVED',
          { step: null, hours: null, what: 'post', reason: 'Broke the Community Guidelines' },
        ],
      ]),
    );
    const warn = await db.moderationAction.findFirstOrThrow({ where: { action: 'WARN' } });
    expect((await act({ action: 'void', strikeId: warn.id, reason: 'Mistake' })).status).toBe(200);
    expect((await listNotifications(aliceId)).map((n) => n.moderation?.step)).toEqual([
      'SUSPEND',
      null,
    ]);
  });
});
