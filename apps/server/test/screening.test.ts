import { beforeEach, describe, expect, it } from 'vitest';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { PATCH as profilePATCH } from '@/app/api/v1/me/profile/route';
import { GET as myReportsGET } from '@/app/api/v1/me/reports/route';
import { PATCH as usernamePATCH } from '@/app/api/v1/me/username/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { PATCH as postPATCH } from '@/app/api/v1/posts/[id]/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import type { ScreeningAction, ScreeningMatch } from '@/generated/prisma/client';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import {
  invalidateScreeningCache,
  normalizeTerm,
  strongestMatch,
} from '@/server/moderation/screening';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let token: string;

async function rule(
  term: string,
  action: ScreeningAction,
  match: ScreeningMatch = 'WORD',
  extra: { enabled?: boolean; message?: string } = {},
) {
  await db.screeningRule.create({
    data: { term, action, match, category: 'THREAT', ...extra },
  });
  invalidateScreeningCache();
}
const post = (body: string, extra: Record<string, unknown> = {}) =>
  call(postsPOST as H, 'POST', { token, body: { reading: reading(), body, ...extra } });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  invalidateScreeningCache();
  await importServiceArea(db, readBoundaryFile());
  const u = await createTestUser('writer_s', { emailVerifiedAt: new Date() });
  token = (await createSession(u.id, 'MOBILE')).token;
});

describe('normalization (P5.4)', () => {
  beforeEach(async () => {
    await rule('kill you', 'BLOCK');
    await rule('scam', 'WARN', 'CONTAINS');
  });

  it.each([
    'I will KILL YOU',
    'i will k1ll you',
    'i will kiiiiill youuu',
    'i will k i l l you',
    'i will k.i.l.l you',
    'i will kíll yöu', // accents
    'i will kіll you', // Cyrillic "і"
    'i will ki​ll you', // zero-width space
    'kill you!',
  ])('catches %s', async (text) => {
    expect((await strongestMatch(text))?.action).toBe('BLOCK');
  });

  it.each([
    'what a skillful youth',
    'the killer whale show',
    'I will call you',
    'kill your engine before refueling',
  ])('does not flag %s', async (text) => {
    expect(await strongestMatch(text)).toBeNull();
  });

  it('CONTAINS rules ignore spaces and punctuation, WORD rules need whole words', async () => {
    expect((await strongestMatch('total s-c-a-m alert'))?.action).toBe('WARN');
    expect((await strongestMatch('scammers everywhere'))?.action).toBe('WARN');
  });

  it('the strongest matching rule wins', async () => {
    expect((await strongestMatch('scam, i will kill you'))?.action).toBe('BLOCK');
  });

  it('terms are normalized the same way', () => {
    expect(normalizeTerm("I'm gonna KILL")).toBe('im gona kil');
  });
});

describe('screening outcomes (P5.4, D56)', () => {
  it('profanity is allowed by default (no rules)', async () => {
    expect((await post('damn this traffic on I-95')).status).toBe(201);
  });

  it('BLOCK refuses the post with an explanation and stores nothing', async () => {
    await rule('kill you', 'BLOCK', 'WORD', { message: 'Threats aren’t allowed.' });
    const r = await post('i will kill you');
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({
      code: 'CONTENT_BLOCKED',
      message: 'Threats aren’t allowed.',
    });
    expect(await db.generalPost.count()).toBe(0);
  });

  it('WARN asks first; "post anyway" goes through', async () => {
    await rule('scam', 'WARN');
    const first = await post('this shop is a scam');
    expect(first.status).toBe(409);
    expect(first.body.error).toMatchObject({
      code: 'CONTENT_WARNING',
      details: { canConfirm: true },
    });
    expect(await db.generalPost.count()).toBe(0);
    expect((await post('this shop is a scam', { confirmWarning: true })).status).toBe(201);
  });

  it('HOLD saves the post hidden and queues it for moderators', async () => {
    await rule('i know where you live', 'HOLD');
    const r = await post('I know where you live');
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ held: true });
    const p = await db.generalPost.findFirstOrThrow();
    expect(p.status).toBe('HELD_FOR_REVIEW');
    // Not in the feed for anyone, including the author.
    const feed = await call(feedPOST as H, 'POST', { token, body: { reading: reading() } });
    expect(feed.body.posts).toHaveLength(0);
    // An automatic report with no reporter (so not in anyone's "My reports").
    const rep = await db.report.findFirstOrThrow();
    expect(rep).toMatchObject({
      generalPostId: p.id,
      reason: 'THREAT',
      reporterUserId: null,
      reporterGuestId: null,
      status: 'OPEN',
    });
    expect((await call(myReportsGET as H, 'GET', { token })).body.reports).toHaveLength(0);
  });

  it('a held comment is hidden and not counted', async () => {
    const postId = (await post('hello neighbors')).body.post.id;
    await rule('kill yourself', 'HOLD');
    const r = await call(commentPOST as H, 'POST', {
      token,
      id: postId,
      body: { reading: reading(), body: 'go kill yourself' },
    });
    expect(r.status).toBe(202);
    expect((await db.comment.findFirstOrThrow()).status).toBe('HELD_FOR_REVIEW');
    expect((await db.generalPost.findUniqueOrThrow({ where: { id: postId } })).commentCount).toBe(
      0,
    );
    expect(await db.report.count()).toBe(1);
  });

  // 🔒 Edits can't be used to slip held content into an already-visible post.
  it('an edit that matches a HOLD rule is refused, not held', async () => {
    const postId = (await post('nice day at the beach')).body.post.id;
    await rule('i know where you live', 'HOLD');
    const r = await call(postPATCH as H, 'PATCH', {
      token,
      id: postId,
      body: { body: 'i know where you live' },
    });
    expect(r.status).toBe(422);
    const p = await db.generalPost.findUniqueOrThrow({ where: { id: postId } });
    expect(p).toMatchObject({ body: 'nice day at the beach', status: 'VISIBLE' });
  });

  it('bios are screened too', async () => {
    await rule('kill you', 'BLOCK');
    const r = await call(profilePATCH as H, 'PATCH', { token, body: { bio: 'i will kill you' } });
    expect(r.status).toBe(422);
  });

  it('usernames that match any rule are refused (sign-up and change)', async () => {
    await rule('kys', 'WARN');
    const reg = await call(registerPOST as H, 'POST', {
      body: {
        username: 'kys_now',
        email: 'x@example.test',
        password: 'correct horse battery',
        birthYear: 1990,
        acceptTerms: true,
        confirmAdult: true,
      },
    });
    expect(reg.status).toBe(422);
    expect(reg.body.error.code).toBe('CONTENT_BLOCKED');
    const ch = await call(usernamePATCH as H, 'PATCH', { token, body: { username: 'k_y_s' } });
    expect(ch.status).toBe(422);
  });

  it('disabled rules are ignored', async () => {
    await rule('kill you', 'BLOCK', 'WORD', { enabled: false });
    expect((await post('this traffic will kill you')).status).toBe(201);
  });

  it('confirmWarning only accepts true (strict schema)', async () => {
    expect((await post('hi', { confirmWarning: 'yes' })).status).toBe(400);
  });
});
