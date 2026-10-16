import { beforeEach, describe, expect, it } from 'vitest';
import { POST as guestsPOST } from '@/app/api/v1/guests/route';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { GET as standingGET } from '@/app/api/v1/me/standing/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { INSTALLATION_HEADER, resolveInstallation } from '@/server/installations';
import { runMaintenance } from '@/server/jobs/maintenance';
import {
  activeStrikes,
  banUser,
  issueStrike,
  liftEnforcement,
  suspendUser,
  voidStrike,
} from '@/server/moderation/enforcement';
import { findForbiddenKeys } from '@/server/serializers';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HOUR = 3_600_000;
const DAY = 86_400_000;

let adminId: string;
let userId: string;
let token: string;

const strike = (reason = 'Harassment in a comment', now?: Date) =>
  issueStrike({ adminId, userId, reason, internalNote: 'see report', now });
const me = () => call(meGET as H, 'GET', { token });

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  adminId = (await createTestUser('admin_e', { role: 'ADMIN' })).id;
  userId = (await createTestUser('user_e', { emailVerifiedAt: new Date() })).id;
  token = (await createSession(userId, 'MOBILE')).token;
});

describe('strike ladder (P5.6, D9, ✅MS3)', () => {
  it('warn → 24 h → 7 days → ban', async () => {
    expect(await strike()).toMatchObject({ action: 'WARN', strike: 1 });
    expect((await me()).status).toBe(200); // a warning doesn't block

    expect(await strike()).toMatchObject({ action: 'SUSPEND', strike: 2, hours: 24 });
    let u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.status).toBe('SUSPENDED');
    expect(u.suspendedUntil!.getTime()).toBeGreaterThan(Date.now() + 23 * HOUR);
    const blocked = await me();
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(blocked.body.error.message).toMatch(/^This account is suspended until /);

    expect(await strike()).toMatchObject({ action: 'SUSPEND', strike: 3, hours: 168 });
    u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.suspendedUntil!.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);

    expect(await strike()).toMatchObject({ action: 'BAN', strike: 4 });
    u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.status).toBe('BANNED');
    expect((await me()).status).toBe(401); // sessions revoked
    await expect(strike()).rejects.toMatchObject({ status: 409 });
  });

  it('strikes older than 180 days stop counting', async () => {
    await strike('old', new Date(Date.now() - 200 * DAY));
    expect(await activeStrikes(userId)).toHaveLength(0);
    expect(await strike()).toMatchObject({ action: 'WARN', strike: 1 });
  });

  it('the ladder is configurable', async () => {
    await db.appConfiguration.create({ data: { key: 'strikes.banAtStrike', value: 2 } });
    invalidateConfigCache();
    await strike();
    expect(await strike()).toMatchObject({ action: 'BAN', strike: 2 });
  });

  // 🔒 a compromised admin account can't sanction other admins from the portal.
  it('admins cannot be sanctioned', async () => {
    const other = await createTestUser('admin_f', { role: 'ADMIN' });
    await expect(issueStrike({ adminId, userId: other.id, reason: 'x' })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('every step is recorded with the admin, reason and internal note', async () => {
    await strike();
    const a = await db.moderationAction.findFirstOrThrow();
    expect(a).toMatchObject({
      adminId,
      targetUserId: userId,
      action: 'WARN',
      reason: 'Harassment in a comment',
      internalNote: 'see report',
    });
  });
});

describe('direct suspensions and bans (P5.6)', () => {
  it('a suspension never shortens a longer one in force', async () => {
    await suspendUser({ adminId, userId, reason: 'x', hours: 72 });
    await suspendUser({ adminId, userId, reason: 'y', hours: 1 });
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.suspendedUntil!.getTime()).toBeGreaterThan(Date.now() + 71 * HOUR);
    await expect(suspendUser({ adminId, userId, reason: 'z', hours: 0 })).rejects.toMatchObject({
      status: 400,
    });
  });

  // 🔒 MS4: a ban carries to the phone, so no new account or guest session from it.
  it('a ban also bans the phones the account used', async () => {
    const instToken = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const inst = await resolveInstallation(
      new Request('http://x', { headers: { [INSTALLATION_HEADER]: instToken } }),
    );
    await createSession(userId, 'MOBILE', new Date(), inst!.id);
    await banUser({ adminId, userId, reason: 'Threats' });
    expect(
      (await db.installation.findUniqueOrThrow({ where: { id: inst!.id } })).bannedAt,
    ).not.toBeNull();
    const guest = await call(guestsPOST as H, 'POST', {
      body: {},
      headers: { [INSTALLATION_HEADER]: instToken },
    });
    expect(guest.status).toBe(403);
    // Lifting the ban frees the phone again.
    await liftEnforcement({ adminId, userId, reason: 'Appeal accepted' });
    expect(
      (await db.installation.findUniqueOrThrow({ where: { id: inst!.id } })).bannedAt,
    ).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('ACTIVE');
  });

  it('an ended suspension stops blocking, and maintenance tidies the status', async () => {
    await suspendUser({ adminId, userId, reason: 'x', hours: 24 });
    await db.user.update({
      where: { id: userId },
      data: { suspendedUntil: new Date(Date.now() - 1000) },
    });
    expect((await me()).status).toBe(200);
    expect((await runMaintenance())?.suspensionsEnded).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('ACTIVE');
  });
});

describe('cancelling a strike (P5.6 / P5.7)', () => {
  it('a voided strike stops counting, and lifts the suspension it caused', async () => {
    await strike();
    await strike(); // 24 h suspension
    const suspension = (await activeStrikes(userId)).at(-1)!;
    await voidStrike({ adminId, actionId: suspension.id, reason: 'Context: it was a quote' });
    expect(await activeStrikes(userId)).toHaveLength(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('ACTIVE');
    await expect(
      voidStrike({ adminId, actionId: suspension.id, reason: 'again' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('my standing (P5.6)', () => {
  it('shows active strikes with the reason, never admin names or internal notes', async () => {
    await strike('Spam links');
    const r = await call(standingGET as H, 'GET', { token });
    expect(r.status).toBe(200);
    expect(r.body.strikes).toEqual([
      expect.objectContaining({ action: 'WARN', reason: 'Spam links', until: null }),
    ]);
    expect(r.raw).not.toMatch(/see report|admin_e|adminId|internalNote/);
    expect(findForbiddenKeys(r.body)).toEqual([]);
  });
});
