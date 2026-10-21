import { beforeEach, describe, expect, it } from 'vitest';
import { PROFILE_COLOR_KEYS } from '@jax/shared';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { PATCH as colorPATCH } from '@/app/api/v1/me/color/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { PATCH as usernamePATCH } from '@/app/api/v1/me/username/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as submitPOST } from '@/app/api/v1/submissions/route';
import { POST as profilePOST } from '@/app/api/v1/users/[username]/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let me: { id: string; token: string };
let other: { id: string; token: string };

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  const u = await createTestUser('painter_c', { emailVerifiedAt: new Date() });
  await db.profile.create({ data: { userId: u.id, color: 'navy' } }); // D108: on the profile
  me = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
  const o = await createTestUser('viewer_c', { emailVerifiedAt: new Date() });
  other = { id: o.id, token: (await createSession(o.id, 'MOBILE')).token };
});

describe('account color (D69)', () => {
  it('a new account gets a random color from the palette', async () => {
    await call(registerPOST as H, 'POST', {
      body: {
        username: 'fresh_c',
        email: 'fresh@example.test',
        password: 'correct horse battery',
        birthYear: 1990,
        acceptTerms: true,
        confirmAdult: true,
      },
    });
    const u = await db.user.findFirstOrThrow({
      where: { username: 'fresh_c' },
      include: { profile: true },
    });
    expect(PROFILE_COLOR_KEYS).toContain(u.profile?.color);
  });

  it('can be changed; only palette colors are accepted', async () => {
    const r = await call(colorPATCH as H, 'PATCH', {
      token: me.token,
      body: { color: 'sunshine' },
    });
    expect(r.status).toBe(200);
    expect(r.body.user.color).toBe('sunshine');
    expect((await call(meGET as H, 'GET', { token: me.token })).body.user.color).toBe('sunshine');
    for (const color of ['#ff0000', 'hotpink', '']) {
      expect(
        (await call(colorPATCH as H, 'PATCH', { token: me.token, body: { color } })).status,
      ).toBe(400);
    }
    expect((await call(colorPATCH as H, 'PATCH', { body: { color: 'red' } })).status).toBe(401);
  });

  it('posts show the author’s current color, name and photo, so changes apply everywhere', async () => {
    await call(postsPOST as H, 'POST', {
      token: me.token,
      body: { reading: reading(), body: 'colorful post' },
    });
    const feed = () =>
      call(feedPOST as H, 'POST', { token: other.token, body: { reading: reading() } });
    expect((await feed()).body.posts[0].author).toMatchObject({
      username: 'painter_c',
      color: 'navy',
      avatarUrl: null,
    });
    await call(colorPATCH as H, 'PATCH', { token: me.token, body: { color: 'gold' } });
    await call(usernamePATCH as H, 'PATCH', { token: me.token, body: { username: 'painter_new' } });
    expect((await feed()).body.posts[0].author).toMatchObject({
      username: 'painter_new',
      color: 'gold',
    });
    const prof = await call(profilePOST as H, 'POST', {
      token: other.token,
      params: { username: 'painter_new' },
      body: { reading: reading() },
    });
    expect(prof.body.profile.color).toBe('gold');
  });
});

describe('place names (D69)', () => {
  it('suggested places can have at most 30 characters', async () => {
    await db.user.update({
      where: { id: me.id },
      data: { createdAt: new Date(Date.now() - 7 * 86_400_000) },
    });
    const long = await call(submitPOST as H, 'POST', {
      token: me.token,
      body: {
        reading: reading(),
        name: 'A Very Long Restaurant Name That Goes On',
        category: 'restaurant',
      },
    });
    expect(long.status).toBe(400);
    const ok = await call(submitPOST as H, 'POST', {
      token: me.token,
      body: { reading: reading(), name: 'Short Name Grill', category: 'restaurant' },
    });
    expect(ok.status).toBe(201);
  });
});
