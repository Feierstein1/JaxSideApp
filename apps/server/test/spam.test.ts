import { beforeEach, describe, expect, it } from 'vitest';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { PATCH as postPATCH } from '@/app/api/v1/posts/[id]/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { invalidateScreeningCache } from '@/server/moderation/screening';
import { countLinks } from '@/server/moderation/spam';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const DAY = 86_400_000;

let token: string;
let userId: string;

const post = (body: string) =>
  call(postsPOST as H, 'POST', { token, body: { reading: reading(), body } });
const comment = (postId: string, body: string) =>
  call(commentPOST as H, 'POST', { token, id: postId, body: { reading: reading(), body } });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await db.appConfiguration.create({ data: { key: 'rateLimit.post.perMinute', value: 100 } });
  invalidateConfigCache();
  invalidateScreeningCache();
  await importServiceArea(db, readBoundaryFile());
  // An established account (a week old), so links aren't held for being new.
  const u = await createTestUser('poster_sp', {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 7 * DAY),
  });
  userId = u.id;
  token = (await createSession(u.id, 'MOBILE')).token;
});

describe('duplicates (P5.5, D57)', () => {
  const TEXT = 'Free concert at the Landing tonight, come through!';

  it('the same text again is refused, even with small disguises', async () => {
    expect((await post(TEXT)).status).toBe(201);
    for (const again of [
      TEXT,
      TEXT.toUpperCase(),
      'Free  concert at the Landing tonight!!! come through',
    ]) {
      const r = await post(again);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('DUPLICATE_CONTENT');
    }
    expect(await db.generalPost.count()).toBe(1);
  });

  it('a post copied into comments counts too', async () => {
    const id = (await post(TEXT)).body.post.id;
    expect((await comment(id, TEXT)).status).toBe(409);
  });

  it('short replies may repeat', async () => {
    const id = (await post('Anyone know a good taco place downtown?')).body.post.id;
    expect((await comment(id, 'thanks!')).status).toBe(201);
    expect((await comment(id, 'thanks!')).status).toBe(201);
  });

  it('after the window, or once deleted, it can be posted again', async () => {
    await post(TEXT);
    await db.generalPost.updateMany({ data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
    expect((await post(TEXT)).status).toBe(201);
    await db.generalPost.updateMany({ data: { status: 'DELETED' } });
    expect((await post(TEXT)).status).toBe(201);
  });

  it('two different people can say the same thing', async () => {
    await post(TEXT);
    const other = await createTestUser('other_sp', { emailVerifiedAt: new Date() });
    const t2 = (await createSession(other.id, 'MOBILE')).token;
    const r = await call(postsPOST as H, 'POST', {
      token: t2,
      body: { reading: reading(), body: TEXT },
    });
    expect(r.status).toBe(201);
  });
});

describe('links (P5.5, D57)', () => {
  it('counts URLs and bare domains', () => {
    expect(countLinks('see https://a.example/x and www.b.org and cheap-deals.shop/now')).toBe(3);
    expect(countLinks('meet at 5.30 near the St. Johns river')).toBe(0);
  });

  it('up to 2 links publish; more are held for review with an automatic report', async () => {
    expect((await post('menus: https://a.example.com and https://b.example.com')).status).toBe(201);
    const r = await post('deals https://x.example.com https://y.example.com https://z.example.com');
    expect(r.status).toBe(202);
    expect(r.body.held).toBe(true);
    const held = await db.generalPost.findFirstOrThrow({ where: { status: 'HELD_FOR_REVIEW' } });
    expect(await db.report.findFirstOrThrow()).toMatchObject({
      generalPostId: held.id,
      reason: 'SPAM',
      reporterUserId: null,
    });
  });

  it('any link from an account under a day old is held', async () => {
    await db.user.update({ where: { id: userId }, data: { createdAt: new Date() } });
    const r = await post('check out mysite.com for more');
    expect(r.status).toBe(202);
  });

  // 🔒 edits can't be used to add a pile of links to a visible post.
  it('an edit with too many links is refused', async () => {
    const id = (await post('Great coffee at the corner shop this morning')).body.post.id;
    const r = await call(postPATCH as H, 'PATCH', {
      token,
      id,
      body: { body: 'a.com b.com c.com' },
    });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('TOO_MANY_LINKS');
  });
});
