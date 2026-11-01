import { describe, expect, it } from 'vitest';
import { GET as meGET } from '@/app/api/v1/me/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { generateToken, hashToken } from '@/server/auth/crypto';
import { db } from '@/server/db';
import { call } from './http-helpers';

/**
 * 🔒 B1.2 / D169: the business website (apps/business) keeps its sessions in its own
 * table. A business session token must never work on the phone app's routes, whether
 * sent the app's way (Bearer) or as a cookie. The business site's own tests cover the
 * other direction (an app token never works there).
 */
describe('🔒 business sessions never work on app routes', () => {
  it('refuses a live business session token as a Bearer token', async () => {
    const account = await db.businessAccount.create({
      data: { email: 'owner@iso.test', passwordHash: 'x' },
    });
    const token = generateToken();
    await db.businessSession.create({
      data: {
        accountId: account.id,
        tokenHash: hashToken(token),
        csrfTokenHash: hashToken(generateToken()),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    expect((await call(meGET, 'GET', { token })).status).toBe(401);
    const write = await call(postsPOST, 'POST', {
      token,
      body: { body: 'hello', latitude: 30.33, longitude: -81.66 },
    });
    expect(write.status).toBe(401);
    const asCookie = await call(meGET, 'GET', { headers: { cookie: `jax_biz=${token}` } });
    expect(asCookie.status).toBe(401);
  });
});
