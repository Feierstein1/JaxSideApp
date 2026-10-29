import { beforeEach, describe, expect, it } from 'vitest';
import { GET as allowanceGET } from '@/app/api/v1/topics/allowance/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { listNearbyChanges, voterAllowed } from '@/server/directory/place-changes';
import { pollVoterAllowed } from '@/server/polls';
import { assertTopicAllowance } from '@/server/topics';
import { resetDb } from './db-helpers';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3322, longitude: -81.6557 };

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
});

async function allowance(token: string, scope: string) {
  const res = await allowanceGET(
    new Request(`http://localhost/api/v1/topics/allowance?scope=${scope}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
    {},
  );
  return { status: res.status, body: await res.json() };
}

describe('new-account waits (D162)', () => {
  it('staff (ADMIN badge or portal admin) skip the waits on a brand-new account', async () => {
    for (const extra of [{ staffBadge: true }, { role: 'ADMIN' as const }]) {
      const u = await createTestUser(`staff_${Object.keys(extra)[0]}`, {
        emailVerifiedAt: new Date(),
        ...extra,
      });
      await expect(voterAllowed(u)).resolves.toBeUndefined();
      await expect(pollVoterAllowed(u)).resolves.toBeUndefined();
      await expect(assertTopicAllowance(u, 'city')).resolves.toBeUndefined();
    }
  });

  // 🔒 A regular new account still waits, and isn't shown place votes it can't cast.
  it('a regular new account still waits and sees no place votes', async () => {
    const u = await createTestUser('newbie', { emailVerifiedAt: new Date() });
    await expect(voterAllowed(u)).rejects.toMatchObject({ code: 'ACCOUNT_TOO_NEW' });
    await expect(pollVoterAllowed(u)).rejects.toMatchObject({ code: 'ACCOUNT_TOO_NEW' });
    await expect(assertTopicAllowance(u, 'city')).rejects.toMatchObject({
      code: 'ACCOUNT_TOO_NEW',
    });
    expect(await listNearbyChanges(u, HERE)).toEqual([]);
  });

  it('the topic check tells the app whether it can open the form', async () => {
    const fresh = await createTestUser('fresh', { emailVerifiedAt: new Date() });
    const staff = await createTestUser('staffer', {
      emailVerifiedAt: new Date(),
      staffBadge: true,
    });
    const a = await allowance((await createSession(fresh.id, 'MOBILE')).token, 'city');
    expect(a.status).toBe(200);
    expect(a.body.allowed).toBe(false);
    expect(a.body.message).toMatch(/after \d+ days/);
    const b = await allowance((await createSession(staff.id, 'MOBILE')).token, 'local');
    expect(b.body).toEqual({ allowed: true });
    expect((await allowance((await createSession(staff.id, 'MOBILE')).token, 'x')).status).toBe(
      400,
    );
  });

  it('the topic check needs an account', async () => {
    const res = await allowanceGET(new Request('http://localhost/x?scope=city'), {});
    expect(res.status).toBe(401);
  });
});
