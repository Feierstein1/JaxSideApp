import { beforeEach, describe, expect, it } from 'vitest';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { PUT as votePUT } from '@/app/api/v1/posts/[id]/vote/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { enforce, waitText } from '@/server/rate-limit';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let token: string;
let postId: string;

async function setConfig(key: string, value: number) {
  await db.appConfiguration.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  invalidateConfigCache();
}

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  const other = await createTestUser('other_rl', { emailVerifiedAt: new Date() });
  const otherToken = (await createSession(other.id, 'MOBILE')).token;
  postId = (
    await call(postsPOST as H, 'POST', {
      token: otherToken,
      body: { reading: reading(), body: 'a post to react to' },
    })
  ).body.post.id;
  const u = await createTestUser('user_rl', { emailVerifiedAt: new Date() });
  token = (await createSession(u.id, 'MOBILE')).token;
});

// 🔒 P5.3 / §11.3: burst limits on top of per-minute and daily ones.
describe('burst limits (P5.3, ✅MS2)', () => {
  it('a second post within 10 seconds is refused, with how long to wait', async () => {
    const post = () =>
      call(postsPOST as H, 'POST', { token, body: { reading: reading(), body: 'hi' } });
    expect((await post()).status).toBe(201);
    const r = await post();
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect(r.body.error.message).toMatch(/^You’re doing that too often\. Try again in /);
    expect(r.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.body.error.details.retryAfterSeconds).toBeLessThanOrEqual(10);
    expect(await db.generalPost.count()).toBe(2); // the setup post + one
  });

  it('the 4th comment within 10 seconds is refused', async () => {
    const codes = [];
    for (let i = 0; i < 4; i++) {
      codes.push(
        (
          await call(commentPOST as H, 'POST', {
            token,
            id: postId,
            body: { reading: reading(), body: `c${i}` },
          })
        ).status,
      );
    }
    expect(codes).toEqual([201, 201, 201, 429]);
  });

  it('votes have a burst limit and a daily cap', async () => {
    await setConfig('rateLimit.vote.burstPer10s', 2);
    const vote = (value: number) =>
      call(votePUT as H, 'PUT', { token, id: postId, body: { reading: reading(), value } });
    expect((await vote(1)).status).toBe(200);
    expect((await vote(0)).status).toBe(200);
    expect((await vote(1)).status).toBe(429);

    await setConfig('rateLimit.vote.burstPer10s', 100);
    await setConfig('rateLimit.vote.perMinute', 100);
    await setConfig('rateLimit.vote.perDay', 3);
    expect((await vote(0)).status).toBe(200); // 3rd today (the burst-refused one stopped before the daily rule)
    const r = await vote(1);
    expect(r.status).toBe(429);
    expect(r.body.error.details.retryAfterSeconds).toBeGreaterThan(10);
  });
});

describe('429 responses (P5.3)', () => {
  it('carry a Retry-After header', async () => {
    await call(postsPOST as H, 'POST', { token, body: { reading: reading(), body: 'one' } });
    const req = new Request('http://localhost/x', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reading: reading(), body: 'two' }),
    });
    const res = await (postsPOST as H)(req, undefined as never);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('say how long to wait in plain words', () => {
    expect(waitText(5)).toBe('a few seconds');
    expect(waitText(45)).toBe('45 seconds');
    expect(waitText(600)).toBe('10 minutes');
    expect(waitText(20_000)).toBe('6 hours');
  });

  it('limits come from AppConfiguration (tunable without a deploy)', async () => {
    await setConfig('rateLimit.feed.perMinute', 1);
    const rule = {
      key: 'feed:test',
      limitKey: 'rateLimit.feed.perMinute' as const,
      windowSeconds: 60,
    };
    await enforce([rule]);
    await expect(enforce([rule])).rejects.toMatchObject({ status: 429 });
  });
});

describe('burst limits at a window edge (D55)', () => {
  it('two requests 2 s apart across a 10 s boundary are still caught', async () => {
    const rule = {
      key: 'edge:test',
      limitKey: 'rateLimit.post.burstPer10s' as const,
      windowSeconds: 10,
    };
    const t0 = new Date(Math.ceil(Date.now() / 10_000) * 10_000 + 9_000); // 1 s before a boundary
    await enforce([rule], t0);
    await expect(enforce([rule], new Date(t0.getTime() + 2_000))).rejects.toMatchObject({
      status: 429,
    });
  });
});
