import { beforeEach, describe, expect, it } from 'vitest';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { promoScore } from '@/server/moderation/promo';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D227 (from D220): deter ads posted from personal accounts, without anyone watching.

const DAY = 86_400_000;
const HERE = { latitude: 30.3151, longitude: -81.686 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

describe('promoScore', () => {
  it('ordinary recommendations and questions stay below the hold line', () => {
    for (const t of [
      'Bold Bean has the best cold brew in Riverside, go try it!',
      'Anyone know a good mechanic near San Marco? Mine charged $400 for brakes.',
      'Their tacos were $3 on Tuesday and honestly worth it.',
      'Is the Publix on Park St open late tonight?',
    ]) {
      expect(promoScore(t)).toBeLessThan(3);
    }
  });

  it('ads from the author’s own business reach it', () => {
    for (const t of [
      'Fresh cakes this weekend! DM us to order, $25 each. Follow us on IG @sweetjax',
      'Use code JAX10 for 10% off at our shop, link in bio',
      'Call me at 904-555-1234 for a free estimate, our prices beat anyone',
      'Order now at sweetjax dot com, $5 delivery',
    ]) {
      expect(promoScore(t)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('posting (D227)', () => {
  let oldToken: string;
  let newToken: string;
  const post = (token: string, body: string) =>
    call(postsPOST as H, 'POST', { token, body: { reading: reading(), body } });

  beforeEach(async () => {
    await resetDb();
    await relaxBurstLimits();
    await importServiceArea(db, readBoundaryFile());
    invalidateConfigCache();
    const old = await createTestUser('regular_p', {
      emailVerifiedAt: new Date(),
      createdAt: new Date(Date.now() - 30 * DAY),
    });
    oldToken = (await createSession(old.id, 'MOBILE')).token;
    const fresh = await createTestUser('newbie_p', { emailVerifiedAt: new Date() });
    newToken = (await createSession(fresh.id, 'MOBILE')).token;
  }, 60_000);

  it('an ad-like post waits for a moderator, and the author gets the nudge', async () => {
    const r = await post(
      oldToken,
      'Cupcakes this weekend! DM us to order, $3 each. Follow us @sweetjax',
    );
    expect(r.status).toBe(202);
    expect(r.body.message).toContain('JaxSide for Business');
    expect((await db.generalPost.findFirstOrThrow()).status).toBe('HELD_FOR_REVIEW');
    expect(await db.report.findFirstOrThrow()).toMatchObject({ reason: 'SELF_PROMOTION' });
  });

  it('a recommendation goes up as usual', async () => {
    const r = await post(oldToken, 'Bold Bean has the best cold brew in Riverside, go try it!');
    expect(r.status).toBe(201);
  });

  // 🔒 New accounts can't post phone numbers for their first days (bots, throwaways).
  it('new accounts can’t post a phone number; older ones can', async () => {
    const r = await post(newToken, 'Lost dog near the park, call 904-555-0199 if you see him');
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('NO_PHONE_NEW_ACCOUNT');
    expect(
      (await post(oldToken, 'Lost dog near the park, call 904-555-0199 if you see him')).status,
    ).toBe(201);
  });
});
