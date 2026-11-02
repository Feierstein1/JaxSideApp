import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as meRoute } from '@/app/api/auth/me/route';
import { GET as teamGet, POST as teamAdd } from '@/app/api/places/[placeId]/team/route';
import { POST as memberUpdate } from '@/app/api/places/[placeId]/team/[accountId]/route';
import { db } from '@/server/db';
import { invalidateScreeningCache } from '@/server/screening';
import { temporaryPassword } from '@/server/team';
import { authed, makeAccount, makePlace, resetBusinessData, signIn, type Browser } from './helpers';

// Route params as Next passes them (`never`: each route types its own).
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

let owner: { id: string };
let placeId: string;
let s: Browser;

async function ownerOf(placeName: string, email: string) {
  const account = await makeAccount({ email });
  const place = await makePlace(placeName);
  await db.businessPlaceAccess.create({
    data: { accountId: account.id, placeId: place.id, role: 'OWNER' },
  });
  return { account, place };
}

const add = (b: Browser, place: string, body: object) =>
  teamAdd(authed('POST', `/api/places/${place}/team`, b, body), ctx({ placeId: place }));
const update = (b: Browser, place: string, accountId: string, body: object) =>
  memberUpdate(
    authed('POST', `/api/places/${place}/team/${accountId}`, b, body),
    ctx({ placeId: place, accountId }),
  );
const list = (b: Browser, place: string) =>
  teamGet(authed('GET', `/api/places/${place}/team`, b), ctx({ placeId: place }));

beforeEach(async () => {
  await resetBusinessData();
  const o = await ownerOf('Bold Bean', 'owner@example.com');
  owner = o.account;
  placeId = o.place.id;
  s = await signIn();
});
afterEach(async () => {
  await db.screeningRule.deleteMany({ where: { term: 'badname' } });
  invalidateScreeningCache();
});

describe('B1.5 employees', () => {
  it('temporary passwords are 12 random characters in three groups', () => {
    const p = temporaryPassword();
    expect(p).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(p).not.toBe(temporaryPassword());
  });

  it('the Owner adds a Staff login; they sign in with the temporary password and must change it', async () => {
    const res = await add(s, placeId, { username: 'Sam.BB', role: 'STAFF', staffName: 'Sam' });
    expect(res.status).toBe(201);
    const { temporaryPassword: temp } = await res.json();
    expect(temp).toMatch(/^[a-z2-9-]{14}$/);

    const sam = await db.businessAccount.findUniqueOrThrow({ where: { username: 'sam.bb' } });
    expect(sam).toMatchObject({ mustChangePassword: true, createdById: owner.id, email: null });
    const signedIn = await signIn('sam.bb', temp);
    expect(signedIn.res.status).toBe(200);
    expect((await signedIn.res.json()).account.mustChangePassword).toBe(true);

    const team = await (await list(s, placeId)).json();
    expect(
      team.team.map((m: { signInName: string; role: string }) => [m.signInName, m.role]),
    ).toEqual([
      ['owner@example.com', 'OWNER'],
      ['sam.bb', 'STAFF'],
    ]);
    expect(JSON.stringify(team)).not.toMatch(/passwordHash|argon2|totp/i);
  });

  it('an existing employee can be given a second place without a new login', async () => {
    const owl = await makePlace('Night Owl');
    await db.businessPlaceAccess.create({
      data: { accountId: owner.id, placeId: owl.id, role: 'OWNER' },
    });
    await add(s, placeId, { username: 'sam.bb', role: 'STAFF' });
    const again = await add(s, owl.id, { username: 'sam.bb', role: 'MANAGER' });
    expect(again.status).toBe(201);
    expect((await again.json()).temporaryPassword).toBeNull();
    expect(await db.businessAccount.count({ where: { username: 'sam.bb' } })).toBe(1);
    expect((await add(s, owl.id, { username: 'sam.bb', role: 'STAFF' })).status).toBe(409);
  });

  it('refuses usernames that are taken, badly shaped, or look like an email', async () => {
    const other = await ownerOf('Other Place', 'other@example.com');
    await db.businessAccount.create({
      data: { username: 'taken.one', passwordHash: 'x', createdById: other.account.id },
    });
    expect((await add(s, placeId, { username: 'taken.one', role: 'STAFF' })).status).toBe(409);
    for (const bad of ['ab', 'sam@bean', '-sam', 'a'.repeat(31), 'sam bean']) {
      expect((await add(s, placeId, { username: bad, role: 'STAFF' })).status).toBe(400);
    }
    // Nobody can be made an Owner through the team page.
    expect((await add(s, placeId, { username: 'boss.bb', role: 'OWNER' })).status).toBe(400);
  });

  it('screens the name shown on posts with the same rules as the app', async () => {
    await db.screeningRule.create({
      data: { term: 'badname', match: 'WORD', action: 'HOLD', category: 'OTHER' },
    });
    invalidateScreeningCache();
    const res = await add(s, placeId, { username: 'sam.bb', role: 'STAFF', staffName: 'B4dname' });
    expect(res.status).toBe(422);
    expect(await db.businessAccount.count({ where: { username: 'sam.bb' } })).toBe(0);
  });

  it('changes role and staff name', async () => {
    await add(s, placeId, { username: 'sam.bb', role: 'STAFF' });
    const sam = await db.businessAccount.findUniqueOrThrow({ where: { username: 'sam.bb' } });
    expect((await update(s, placeId, sam.id, { action: 'role', role: 'MANAGER' })).status).toBe(
      200,
    );
    expect(
      (await update(s, placeId, sam.id, { action: 'staff-name', staffName: 'Sam' })).status,
    ).toBe(200);
    expect(
      await db.businessPlaceAccess.findFirstOrThrow({ where: { accountId: sam.id } }),
    ).toMatchObject({ role: 'MANAGER', staffName: 'Sam' });
  });

  it('a reset signs them out everywhere, clears two-step sign-in, and needs a new password', async () => {
    const temp1 = (await (await add(s, placeId, { username: 'sam.bb', role: 'STAFF' })).json())
      .temporaryPassword;
    const sam = await db.businessAccount.findUniqueOrThrow({ where: { username: 'sam.bb' } });
    const samSession = await signIn('sam.bb', temp1);
    await db.businessAccount.update({
      where: { id: sam.id },
      data: { mustChangePassword: false, totpEnabledAt: new Date(), totpSecretEnc: 'x' },
    });
    const r = await update(s, placeId, sam.id, { action: 'reset-password' });
    const { temporaryPassword: temp2 } = await r.json();
    expect(temp2).not.toBe(temp1);
    expect((await meRoute(authed('GET', '/api/auth/me', samSession), {})).status).toBe(401);
    expect((await signIn('sam.bb', temp1)).res.status).toBe(401);
    const fresh = await signIn('sam.bb', temp2);
    expect(fresh.res.status).toBe(200); // no code asked: two-step sign-in was cleared
    expect((await fresh.res.json()).account.mustChangePassword).toBe(true);
  });

  it('removing someone from their last place ends their login; with places left it stays', async () => {
    const owl = await makePlace('Night Owl');
    await db.businessPlaceAccess.create({
      data: { accountId: owner.id, placeId: owl.id, role: 'OWNER' },
    });
    const temp = (await (await add(s, placeId, { username: 'sam.bb', role: 'STAFF' })).json())
      .temporaryPassword;
    await add(s, owl.id, { username: 'sam.bb', role: 'STAFF' });
    const sam = await db.businessAccount.findUniqueOrThrow({ where: { username: 'sam.bb' } });
    const samSession = await signIn('sam.bb', temp);

    await update(s, placeId, sam.id, { action: 'remove' });
    expect(
      (await db.businessAccount.findUniqueOrThrow({ where: { id: sam.id } })).revokedAt,
    ).toBeNull();
    expect((await meRoute(authed('GET', '/api/auth/me', samSession), {})).status).toBe(200);

    await update(s, owl.id, sam.id, { action: 'remove' });
    expect(
      (await db.businessAccount.findUniqueOrThrow({ where: { id: sam.id } })).revokedAt,
    ).not.toBeNull();
    expect((await meRoute(authed('GET', '/api/auth/me', samSession), {})).status).toBe(401);
    expect((await signIn('sam.bb', temp)).res.status).toBe(401);
  });
});

describe('🔒 B1.5 roles and boundaries', () => {
  it('Staff and Managers can’t see or manage the team', async () => {
    for (const role of ['STAFF', 'MANAGER'] as const) {
      const username = `${role.toLowerCase()}.bb`;
      const temp = (await (await add(s, placeId, { username, role })).json()).temporaryPassword;
      const login = await signIn(username, temp);
      // Get past the forced password change, as they would.
      await db.businessAccount.update({
        where: { username },
        data: { mustChangePassword: false },
      });
      expect((await list(login, placeId)).status).toBe(403);
      expect((await add(login, placeId, { username: `x${username}`, role: 'STAFF' })).status).toBe(
        403,
      );
      expect((await update(login, placeId, owner.id, { action: 'remove' })).status).toBe(403);
    }
  });

  it('another business’s Owner can’t see or touch this team, even knowing ids', async () => {
    await add(s, placeId, { username: 'sam.bb', role: 'STAFF' });
    const sam = await db.businessAccount.findUniqueOrThrow({ where: { username: 'sam.bb' } });
    const other = await ownerOf('Other Place', 'other@example.com');
    const them = await signIn('other@example.com');

    expect((await list(them, placeId)).status).toBe(404);
    expect((await add(them, placeId, { username: 'spy.bb', role: 'STAFF' })).status).toBe(404);
    expect((await update(them, placeId, sam.id, { action: 'reset-password' })).status).toBe(404);
    // Their own place, but someone else's employee: still "not found".
    expect((await update(them, other.place.id, sam.id, { action: 'remove' })).status).toBe(404);
    expect(
      await db.businessPlaceAccess.count({ where: { accountId: sam.id, revokedAt: null } }),
    ).toBe(1);
  });

  it('nobody changes the Owner here, and only logins this Owner made can be managed', async () => {
    expect((await update(s, placeId, owner.id, { action: 'remove' })).status).toBe(403);
    // An employee another Owner made, given access here some other way (say, by an admin).
    const other = await ownerOf('Other Place', 'other@example.com');
    const theirs = await db.businessAccount.create({
      data: { username: 'their.sam', passwordHash: 'x', createdById: other.account.id },
    });
    await db.businessPlaceAccess.create({
      data: { accountId: theirs.id, placeId, role: 'STAFF' },
    });
    expect((await update(s, placeId, theirs.id, { action: 'reset-password' })).status).toBe(404);
    const team = (await (await list(s, placeId)).json()).team as {
      signInName: string;
      manageable: boolean;
    }[];
    expect(team.find((m) => m.signInName === 'their.sam')?.manageable).toBe(false);
  });
});
