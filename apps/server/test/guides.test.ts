import { beforeEach, describe, expect, it } from 'vitest';
import { GUIDE_KEYS, GUIDES } from '@jax/shared';
import { GET as guidesGET, POST as guidesPOST } from '@/app/api/v1/me/guides/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D104: first-time guides, remembered per account.

let token: string;
let other: string;
beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  token = (await createSession((await createTestUser('guide_a')).id, 'MOBILE')).token;
  other = (await createSession((await createTestUser('guide_b')).id, 'MOBILE')).token;
});

describe('first-time guides (D104)', () => {
  it('remembers “Got it” per account, at the guide’s version', async () => {
    expect((await call(guidesGET as H, 'GET', { token })).body).toEqual({ seen: {} });
    expect((await call(guidesPOST as H, 'POST', { token, body: { key: 'areaPost' } })).status).toBe(
      200,
    );
    expect((await call(guidesGET as H, 'GET', { token })).body.seen).toEqual({
      areaPost: GUIDES.areaPost.version,
    });
    // Another account (or a new phone signed into it) is separate.
    expect((await call(guidesGET as H, 'GET', { token: other })).body.seen).toEqual({});
    expect(await db.guideSeen.count()).toBe(1);
  });

  it('refuses unknown guides and needs a session', async () => {
    expect((await call(guidesPOST as H, 'POST', { token, body: { key: 'nope' } })).status).toBe(
      400,
    );
    expect((await call(guidesGET as H, 'GET')).status).toBe(401);
  });

  it('every guide is short: at most 4 pages and 5 points per page', () => {
    for (const key of GUIDE_KEYS) {
      const g = GUIDES[key];
      expect(g.key).toBe(key);
      expect(g.pages.length).toBeGreaterThan(0);
      expect(g.pages.length).toBeLessThanOrEqual(4);
      for (const p of g.pages) expect(p.items.length).toBeLessThanOrEqual(5);
    }
  });
});
