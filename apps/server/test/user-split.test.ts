import { beforeEach, describe, expect, it } from 'vitest';
import { PATCH as colorPATCH } from '@/app/api/v1/me/color/route';
import { PATCH as privacyPATCH } from '@/app/api/v1/me/friend-privacy/route';
import { PATCH as prefsPATCH } from '@/app/api/v1/me/preferences/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// P13.8 (D108): admin 2FA → AdminCredential, preferences → UserSettings, color → Profile.

let token: string;
let userId: string;
beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  const u = await createTestUser('split_me', { emailVerifiedAt: new Date() });
  userId = u.id;
  token = (await createSession(u.id, 'MOBILE')).token;
});

const me = async () => (await call(meGET as H, 'GET', { token })).body.user;

describe('the User row holds only the account (P13.8, D108)', () => {
  it('the moved columns are gone from User and live in their own tables', async () => {
    const cols = async (table: string) =>
      (
        await db.$queryRaw<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`
      ).map((r) => r.column_name);
    const user = await cols('User');
    for (const moved of [
      'totpSecretEnc',
      'totpEnabledAt',
      'totpLastStep',
      'generalRadiusMiles',
      'businessRadiusMiles',
      'hidePostsFromFriends',
      'profileColor',
    ])
      expect(user).not.toContain(moved);
    expect(await cols('AdminCredential')).toEqual(
      expect.arrayContaining(['totpSecretEnc', 'totpEnabledAt', 'totpLastStep']),
    );
    expect(await cols('UserSettings')).toEqual(
      expect.arrayContaining(['generalRadiusMiles', 'businessRadiusMiles', 'hidePostsFromFriends']),
    );
    expect(await cols('Profile')).toContain('color');
  });

  // 🔒 The User table's radius rule moved with the columns.
  it('a radius must still be positive', async () => {
    await expect(
      db.userSettings.create({ data: { userId, generalRadiusMiles: 0 } }),
    ).rejects.toThrow(/radius_positive/);
    await expect(
      db.userSettings.create({ data: { userId, businessRadiusMiles: -1 } }),
    ).rejects.toThrow(/radius_positive/);
  });

  it('no settings or profile row means the defaults', async () => {
    expect(await db.userSettings.count()).toBe(0);
    expect(await me()).toMatchObject({
      radiusMiles: null,
      hidePostsFromFriends: false,
      color: 'teal',
    });
  });

  it('changing a preference or the color writes its own table, and “me” reflects it', async () => {
    expect(
      (await call(prefsPATCH as H, 'PATCH', { token, body: { radiusMiles: 0.2 } })).status,
    ).toBe(200);
    expect(
      (await call(privacyPATCH as H, 'PATCH', { token, body: { hidePostsFromFriends: true } }))
        .status,
    ).toBe(200);
    expect((await call(colorPATCH as H, 'PATCH', { token, body: { color: 'navy' } })).status).toBe(
      200,
    );
    expect(await db.userSettings.findUniqueOrThrow({ where: { userId } })).toMatchObject({
      generalRadiusMiles: 0.2,
      businessRadiusMiles: 0.2,
      hidePostsFromFriends: true,
    });
    expect((await db.profile.findUniqueOrThrow({ where: { userId } })).color).toBe('navy');
    expect(await me()).toMatchObject({
      radiusMiles: 0.2,
      hidePostsFromFriends: true,
      color: 'navy',
    });
  });

  // 🔒 The account view never carries the 2FA secret, even for an admin.
  it('the account view never includes 2FA data', async () => {
    await db.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    await db.adminCredential.create({
      data: { userId, totpSecretEnc: 'secret-enc', totpEnabledAt: new Date(), totpLastStep: 5 },
    });
    const raw = JSON.stringify(await me());
    expect(raw).not.toMatch(/totp|secret-enc/i);
  });
});
