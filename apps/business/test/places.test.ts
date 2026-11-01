import { beforeEach, describe, expect, it } from 'vitest';
import { GET as placesRoute } from '@/app/api/places/route';
import { db } from '@/server/db';
import { can, myPlaces, requirePlace } from '@/server/places';
import { authed, makeAccount, makePlace, resetBusinessData, signIn } from './helpers';

beforeEach(resetBusinessData);

async function grant(accountId: string, placeId: string, role: 'OWNER' | 'MANAGER' | 'STAFF') {
  return db.businessPlaceAccess.create({ data: { accountId, placeId, role } });
}

describe('B1.4 places', () => {
  it('lists only live access to active places, by name, with the role', async () => {
    const me = await makeAccount();
    const owl = await makePlace('Night Owl');
    const bean = await makePlace('Bold Bean');
    const gone = await makePlace('Closed Diner');
    const old = await makePlace('Old Job');
    await grant(me.id, owl.id, 'OWNER');
    await grant(me.id, bean.id, 'MANAGER');
    await grant(me.id, gone.id, 'OWNER');
    await db.businessPlace.update({ where: { id: gone.id }, data: { status: 'REMOVED' } });
    const revoked = await grant(me.id, old.id, 'STAFF');
    await db.businessPlaceAccess.update({
      where: { id: revoked.id },
      data: { revokedAt: new Date() },
    });

    const list = await myPlaces(me.id);
    expect(list.map((p) => [p.name, p.role])).toEqual([
      ['Bold Bean', 'MANAGER'],
      ['Night Owl', 'OWNER'],
    ]);
    const s = await signIn();
    const res = await placesRoute(authed('GET', '/api/places', s), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.places).toHaveLength(2);
    // Nothing about the phone-app owner behind the claim.
    expect(JSON.stringify(body)).not.toMatch(/userId|ownerClaim|username|email/i);
  });

  it('🔒 nobody reaches another business’s place, and wrong ids look the same', async () => {
    const me = await makeAccount();
    const other = await makeAccount({ email: 'other@example.com' });
    const mine = await makePlace('Mine');
    const theirs = await makePlace('Theirs');
    await grant(me.id, mine.id, 'OWNER');
    await grant(other.id, theirs.id, 'OWNER');

    expect((await requirePlace(me.id, mine.id)).name).toBe('Mine');
    const err = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e) => (e as { status: number }).status,
      );
    expect(await err(requirePlace(me.id, theirs.id))).toBe(404);
    expect(await err(requirePlace(me.id, '00000000-0000-7000-8000-000000000000'))).toBe(404);
    expect(await err(requirePlace(me.id, "x' OR 1=1 --"))).toBe(404);
  });

  it('🔒 roles: Staff can post but not manage the team, ads or billing', async () => {
    const me = await makeAccount({ username: 'sam.bb' });
    const place = await makePlace();
    await grant(me.id, place.id, 'STAFF');
    expect((await requirePlace(me.id, place.id, 'discussion')).role).toBe('STAFF');
    for (const ability of ['team', 'ads', 'billing', 'insights'] as const) {
      await expect(requirePlace(me.id, place.id, ability)).rejects.toMatchObject({ status: 403 });
    }
    expect(can('MANAGER', 'ads')).toBe(true);
    expect(can('MANAGER', 'team')).toBe(false);
    expect(can('OWNER', 'billing')).toBe(true);
  });
});
