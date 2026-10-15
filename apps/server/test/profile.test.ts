import { beforeEach, describe, expect, it } from 'vitest';
import { PATCH as profilePATCH } from '@/app/api/v1/me/profile/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

let token: string;
beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  token = (await createSession((await createTestUser('biofan')).id, 'MOBILE')).token;
});

describe('PATCH /me/profile (P4.8, early)', () => {
  it('sets, shows and clears the bio', async () => {
    const r = await call(profilePATCH as H, 'PATCH', {
      token,
      body: { bio: '  Riverside since 2010  ' },
    });
    expect(r.status).toBe(200);
    expect(r.body.user.bio).toBe('Riverside since 2010');
    expect((await call(meGET as H, 'GET', { token })).body.user.bio).toBe('Riverside since 2010');
    expect(
      (await call(profilePATCH as H, 'PATCH', { token, body: { bio: '' } })).body.user.bio,
    ).toBeNull();
  });

  it.each([
    [{ bio: 'x'.repeat(301) }],
    [{ bio: 'bad\u0007char' }],
    [{ bio: 'ok', username: 'takeover' }],
    [{}],
  ])('rejects %j', async (body) => {
    expect((await call(profilePATCH as H, 'PATCH', { token, body })).status).toBe(400);
  });

  it('keeps text exactly as typed (plain text)', async () => {
    const r = await call(profilePATCH as H, 'PATCH', { token, body: { bio: '<b>hi</b> & bye' } });
    expect(r.body.user.bio).toBe('<b>hi</b> & bye');
  });
});
