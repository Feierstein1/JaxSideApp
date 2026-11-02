import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as noticesRoute } from '@/app/api/account/notices/route';
import { GET as inboxRoute } from '@/app/api/inbox/route';
import { POST as seenRoute } from '@/app/api/inbox/seen/route';
import { db } from '@/server/db';
import { getInbox, sendDigests, unreadCount } from '@/server/inbox';
import { setMailer, type OutgoingMail } from '@/server/mailer';
import {
  authed,
  makeAccount,
  makeAppUser,
  makePlace,
  resetBusinessData,
  signIn,
  type Browser,
} from './helpers';

const HOUR = 3_600_000;
let owner: Awaited<ReturnType<typeof makeAccount>>;
let placeId: string;
let s: Browser;
let mail: OutgoingMail[];

/** Something a phone-app person wrote at the place, `hoursAgo` ago. */
async function appPost(body: string, hoursAgo = 0, place = placeId) {
  const u = await makeAppUser();
  return db.businessPost.create({
    data: {
      placeId: place,
      authorId: u.id,
      body,
      createdAt: new Date(Date.now() - hoursAgo * HOUR),
    },
  });
}

beforeEach(async () => {
  await resetBusinessData();
  owner = await makeAccount();
  placeId = (await makePlace('Bold Bean')).id;
  // Joined two days ago, so anything newer counts as new.
  await db.businessPlaceAccess.create({
    data: {
      accountId: owner.id,
      placeId,
      role: 'OWNER',
      createdAt: new Date(Date.now() - 48 * HOUR),
    },
  });
  s = await signIn();
  mail = [];
  setMailer({ send: async (m) => void mail.push(m) });
});
afterAll(() => setMailer(undefined));

describe('B1.8 inbox', () => {
  it('shows people’s new posts and comments, never the business’s own', async () => {
    const post = await appPost('Is the patio open?', 2);
    await db.businessPost.create({
      data: { placeId, businessAuthorId: owner.id, body: 'Our news' },
    });
    const ours = await db.comment.create({
      data: {
        businessPostId: post.id,
        authorKind: 'BUSINESS',
        authorBusinessId: owner.id,
        body: 'Yes!',
      },
    });
    const u = await makeAppUser();
    await db.comment.create({
      data: {
        businessPostId: post.id,
        authorKind: 'USER',
        authorUserId: u.id,
        parentCommentId: ours.id,
        depth: 1,
        body: 'Thanks!',
      },
    });

    const { places } = await getInbox(owner);
    expect(places[0]).toMatchObject({
      placeName: 'Bold Bean',
      newPostCount: 1,
      newCommentCount: 1,
    });
    expect(places[0]!.newPosts.map((p) => p.excerpt)).toEqual(['Is the patio open?']);
    expect(places[0]!.commentedPosts).toEqual([
      expect.objectContaining({ postId: post.id, count: 1, repliesToUs: 1 }),
    ]);
    expect(await unreadCount(owner)).toBe(2);
  });

  it('“seen” moves the line: only newer activity shows afterwards', async () => {
    await appPost('old one', 5);
    expect((await seenRoute(authed('POST', '/api/inbox/seen', s, { placeId }), {})).status).toBe(
      200,
    );
    expect(await unreadCount(owner)).toBe(0);
    await appPost('new one');
    const res = await (await inboxRoute(authed('GET', '/api/inbox', s), {})).json();
    expect(res.places[0].newPosts.map((p: { excerpt: string }) => p.excerpt)).toEqual(['new one']);
  });

  it('shows messages from JaxSide; "mark everything" reads them too', async () => {
    await db.businessNotice.create({
      data: {
        accountId: owner.id,
        placeId,
        kind: 'PLACE_ADDED',
        title: 'Bold Bean was added',
        link: `/places/${placeId}`,
      },
    });
    expect((await getInbox(owner)).notices[0]).toMatchObject({
      title: 'Bold Bean was added',
      read: false,
    });
    expect(await unreadCount(owner)).toBe(1);
    await seenRoute(authed('POST', '/api/inbox/seen', s, {}), {});
    expect((await getInbox(owner)).notices[0]!.read).toBe(true);
    expect(await unreadCount(owner)).toBe(0);
  });

  it('🔒 only this login’s places and messages', async () => {
    const other = await makeAccount({ email: 'other@example.com' });
    const theirs = await makePlace('Other Place');
    await db.businessPlaceAccess.create({
      data: { accountId: other.id, placeId: theirs.id, role: 'OWNER' },
    });
    await appPost('about them', 0, theirs.id);
    await db.businessNotice.create({
      data: { accountId: other.id, kind: 'FROM_JAXSIDE', title: 'secret' },
    });
    const mine = await (await inboxRoute(authed('GET', '/api/inbox', s), {})).json();
    expect(JSON.stringify(mine)).not.toMatch(/about them|secret|Other Place/);
    // Marking someone else's place as seen is "not found".
    expect(
      (await seenRoute(authed('POST', '/api/inbox/seen', s, { placeId: theirs.id }), {})).status,
    ).toBe(404);
    // A removed place drops out of the inbox at once.
    await db.businessPlaceAccess.updateMany({
      where: { accountId: owner.id },
      data: { revokedAt: new Date() },
    });
    await appPost('after removal');
    expect((await getInbox(owner)).places).toEqual([]);
  });
});

describe('B1.8 summary email', () => {
  const turnOn = () => noticesRoute(authed('POST', '/api/account/notices', s, { on: true }), {});

  it('sends one summary when there’s something new, then not again for a day', async () => {
    expect((await turnOn()).status).toBe(200);
    expect(await sendDigests()).toBe(0); // nothing new yet
    await appPost('Is the patio open?');
    expect(await sendDigests()).toBe(1);
    expect(mail[0]).toMatchObject({
      to: 'owner@example.com',
      subject: 'New activity at your place on JaxSide',
    });
    expect(mail[0]!.text).toContain('Bold Bean: 1 new post');
    expect(mail[0]!.text).toContain('/inbox');
    expect(mail[0]!.text).not.toContain('patio'); // counts only, no one's words in email

    await appPost('another');
    expect(await sendDigests()).toBe(0); // once a day at most
    expect(await sendDigests(new Date(Date.now() + 25 * HOUR))).toBe(1);
    expect(mail[1]!.text).toContain('Bold Bean: 1 new post'); // only what's new since the last one
  });

  it('is off by default, and not for suspended logins or logins without an email', async () => {
    await appPost('hello');
    expect(await sendDigests()).toBe(0);
    await turnOn();
    await db.businessAccount.update({ where: { id: owner.id }, data: { suspendedAt: new Date() } });
    expect(await sendDigests()).toBe(0);

    const staff = await makeAccount({ username: 'sam.bb' });
    await db.businessPlaceAccess.create({ data: { accountId: staff.id, placeId, role: 'STAFF' } });
    const staffS = await signIn('sam.bb');
    const r = await noticesRoute(authed('POST', '/api/account/notices', staffS, { on: true }), {});
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('NO_EMAIL');
  });
});
