import { beforeEach, describe, expect, it } from 'vitest';
import { POST as acceptRoute } from '@/app/api/invites/accept/route';
import { POST as acceptNewRoute } from '@/app/api/invites/accept-new/route';
import { GET as meRoute } from '@/app/api/auth/me/route';
import { safeNext } from '@/app/safe-next';
import { db } from '@/server/db';
import { invitePreview } from '@/server/invites';
import {
  PASSWORD,
  authed,
  cookiesFrom,
  makeAccount,
  makeInvite,
  makeOwnerClaim,
  makePlace,
  post,
  resetBusinessData,
  signIn,
} from './helpers';

beforeEach(resetBusinessData);

const NEW = { email: 'hello@boldbean.com', password: 'a strong business password' };
const acceptNew = (token: string, body: object = NEW) =>
  acceptNewRoute(post('/api/invites/accept-new', { token, ...body }), {});

describe('B1.3 invite → business account', () => {
  it('shows the place, then creates the account as its Owner and signs it in', async () => {
    const place = await makePlace('Bold Bean');
    const claim = await makeOwnerClaim(place.id);
    const token = await makeInvite(claim);
    expect(await invitePreview(token)).toEqual({ ok: true, placeName: 'Bold Bean' });
    // Opening the page used nothing.
    expect((await db.businessInvite.findFirstOrThrow()).usedAt).toBeNull();

    const res = await acceptNew(token);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.places).toEqual(['Bold Bean']);
    expect(body.account.email).toBe('hello@boldbean.com');
    const s = cookiesFrom(res);
    expect((await meRoute(authed('GET', '/api/auth/me', s), {})).status).toBe(200);

    const access = await db.businessPlaceAccess.findFirstOrThrow();
    expect(access).toMatchObject({ placeId: place.id, role: 'OWNER', ownerClaimId: claim.id });
    const invite = await db.businessInvite.findFirstOrThrow();
    expect(invite.usedAt).not.toBeNull();
    expect(invite.usedByAccountId).toBe(body.account.id);
    // The new account signs in with its own email and password.
    expect((await signIn(NEW.email, NEW.password)).res.status).toBe(200);
  });

  it("links the same person's other verified places, not anyone else's", async () => {
    const cafe = await makePlace('Bold Bean');
    const bar = await makePlace('Night Owl');
    const shop = await makePlace('Tiny Shop');
    const other = await makePlace('Somebody Else');
    const claim = await makeOwnerClaim(cafe.id);
    await makeOwnerClaim(bar.id, { userId: claim.userId });
    await makeOwnerClaim(shop.id, { userId: claim.userId, primary: false }); // team member only
    await makeOwnerClaim(other.id);
    const body = await (await acceptNew(await makeInvite(claim))).json();
    expect([...body.places].sort()).toEqual(['Bold Bean', 'Night Owl']);
    expect(await db.businessPlaceAccess.count()).toBe(2);
  });

  it('🔒 a link works once, and never after it expires or is made up', async () => {
    const place = await makePlace();
    const claim = await makeOwnerClaim(place.id);
    const token = await makeInvite(claim);
    expect((await acceptNew(token)).status).toBe(201);
    const again = await acceptNew(token, { ...NEW, email: 'second@boldbean.com' });
    expect(again.status).toBe(410);
    expect((await invitePreview(token)).ok).toBe(false);

    const place2 = await makePlace('Night Owl');
    const old = await makeInvite(await makeOwnerClaim(place2.id), new Date(Date.now() - 1000));
    expect((await acceptNew(old, { ...NEW, email: 'x@nightowl.com' })).status).toBe(410);
    expect((await acceptNew('a'.repeat(43), { ...NEW, email: 'y@nightowl.com' })).status).toBe(410);
    expect(await db.businessAccount.count()).toBe(1);
  });

  it('🔒 a removed Owner tag or a place that already has an owner stops the link', async () => {
    const place = await makePlace();
    const revoked = await makeOwnerClaim(place.id, { status: 'REVOKED' });
    expect((await acceptNew(await makeInvite(revoked))).status).toBe(410);

    const claim = await makeOwnerClaim(place.id);
    const someone = await makeAccount({ email: 'first@boldbean.com' });
    await db.businessPlaceAccess.create({
      data: { accountId: someone.id, placeId: place.id, role: 'OWNER' },
    });
    const res = await acceptNew(await makeInvite(claim));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('PLACE_HAS_OWNER');
    expect(await db.businessAccount.count()).toBe(1);
  });

  it('refuses an email already used by a business account, and weak passwords', async () => {
    const place = await makePlace();
    const token = await makeInvite(await makeOwnerClaim(place.id));
    await makeAccount({ email: NEW.email });
    const taken = await acceptNew(token);
    expect(taken.status).toBe(409);
    expect((await taken.json()).error.code).toBe('EMAIL_TAKEN');
    expect((await acceptNew(token, { email: 'new@boldbean.com', password: 'short' })).status).toBe(
      400,
    );
    // The link is still good after those refusals.
    expect((await db.businessInvite.findFirstOrThrow()).usedAt).toBeNull();
  });

  it('a signed-in owner adds the place to their existing account', async () => {
    const owner = await makeAccount();
    const place = await makePlace('Night Owl');
    const token = await makeInvite(await makeOwnerClaim(place.id));
    const s = await signIn();
    const res = await acceptRoute(authed('POST', '/api/invites/accept', s, { token }), {});
    expect(res.status).toBe(200);
    expect((await res.json()).places).toEqual(['Night Owl']);
    expect(await db.businessPlaceAccess.findFirstOrThrow()).toMatchObject({
      accountId: owner.id,
      role: 'OWNER',
    });
  });

  it('🔒 a staff login can’t take a place, and adding needs a session and CSRF', async () => {
    const owner = await makeAccount();
    const staff = await db.businessAccount.update({
      where: { id: (await makeAccount({ username: 'sam.bb' })).id },
      data: { createdById: owner.id },
    });
    const place = await makePlace();
    const token = await makeInvite(await makeOwnerClaim(place.id));
    const s = await signIn(staff.username!);
    const res = await acceptRoute(authed('POST', '/api/invites/accept', s, { token }), {});
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('NOT_AN_OWNER_ACCOUNT');
    expect(await db.businessPlaceAccess.count()).toBe(0);
    expect((await acceptRoute(post('/api/invites/accept', { token }), {})).status).toBe(401);
  });

  it('after signing in, only goes back to a page on this site', () => {
    expect(safeNext('/invite?token=abc')).toBe('/invite?token=abc');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    void PASSWORD;
  });
});
