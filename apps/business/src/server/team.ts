import { randomInt } from 'node:crypto';
import type { BusinessAccount, BusinessRole } from '@/generated/prisma/client';
import { hashPassword } from './crypto';
import { db } from './db';
import { ApiError } from './http';
import { requirePlace } from './places';
import { screenText } from './screening';

/**
 * B1.5: the people who run a place. Only its Owner manages the team (`requirePlace(...,
 * 'team')`). Employees get logins the Owner creates: a username and a temporary password
 * shown once, changed at first sign-in. The Owner can change roles and staff names, reset
 * a password, or remove someone; an employee with no places left can't sign in at all.
 */

export type TeamMember = {
  accountId: string;
  signInName: string;
  role: BusinessRole;
  staffName: string | null;
  since: string;
  isMe: boolean;
  /** Employees whose login this Owner made: the Owner can reset or remove them. */
  manageable: boolean;
  mustChangePassword: boolean;
};

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Not found.');

/** 12 random letters and digits in three groups, without look-alikes (0/o, 1/l/i). */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

export async function teamFor(owner: BusinessAccount, placeId: string): Promise<TeamMember[]> {
  await requirePlace(owner.id, placeId, 'team');
  const rows = await db.businessPlaceAccess.findMany({
    where: { placeId, revokedAt: null, account: { revokedAt: null } },
    include: { account: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((a) => ({
    accountId: a.accountId,
    signInName: a.account.username ?? a.account.email ?? '',
    role: a.role,
    staffName: a.staffName,
    since: a.createdAt.toISOString(),
    isMe: a.accountId === owner.id,
    manageable: a.role !== 'OWNER' && a.account.createdById === owner.id,
    mustChangePassword: a.account.mustChangePassword,
  }));
}

/**
 * Adds someone to the place. A new username makes a new login (the temporary password is
 * returned once); one of this Owner's existing employees is just given this place too.
 */
export async function addMember(
  owner: BusinessAccount,
  placeId: string,
  input: { username: string; role: 'MANAGER' | 'STAFF'; staffName?: string },
  now = new Date(),
): Promise<{ accountId: string; temporaryPassword: string | null }> {
  await requirePlace(owner.id, placeId, 'team');
  if (input.staffName) await screenText(input.staffName, 'name');
  const existing = await db.businessAccount.findUnique({ where: { username: input.username } });

  if (existing) {
    if (existing.createdById !== owner.id || existing.revokedAt) {
      throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken. Please pick another.');
    }
    const live = await db.businessPlaceAccess.findFirst({
      where: { accountId: existing.id, placeId, revokedAt: null },
    });
    if (live) throw new ApiError(409, 'ALREADY_ON_TEAM', 'They’re already on this place’s team.');
    await db.businessPlaceAccess.create({
      data: {
        accountId: existing.id,
        placeId,
        role: input.role,
        staffName: input.staffName ?? null,
        grantedById: owner.id,
        createdAt: now,
      },
    });
    return { accountId: existing.id, temporaryPassword: null };
  }

  const password = temporaryPassword();
  const account = await db
    .$transaction(async (tx) => {
      const account = await tx.businessAccount.create({
        data: {
          username: input.username,
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          createdById: owner.id,
          createdAt: now,
        },
      });
      await tx.businessPlaceAccess.create({
        data: {
          accountId: account.id,
          placeId,
          role: input.role,
          staffName: input.staffName ?? null,
          grantedById: owner.id,
          createdAt: now,
        },
      });
      return account;
    })
    .catch((err) => {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken. Please pick another.');
      }
      throw err;
    });
  return { accountId: account.id, temporaryPassword: password };
}

type Update =
  | { action: 'role'; role: 'MANAGER' | 'STAFF' }
  | { action: 'staff-name'; staffName: string | null }
  | { action: 'reset-password' }
  | { action: 'remove' };

/**
 * 🔒 Changes to one team member. The target must be on this place's team, must not be the
 * Owner, and must be a login this Owner created; anything else is "not found".
 */
export async function updateMember(
  owner: BusinessAccount,
  placeId: string,
  accountId: string,
  input: Update,
  now = new Date(),
): Promise<{ temporaryPassword: string | null }> {
  await requirePlace(owner.id, placeId, 'team');
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) throw notFound();
  const access = await db.businessPlaceAccess.findFirst({
    where: { accountId, placeId, revokedAt: null },
    include: { account: true },
  });
  if (!access || access.account.revokedAt) throw notFound();
  if (access.role === 'OWNER') {
    throw new ApiError(403, 'OWNER', 'The Owner can’t be changed here. Contact JaxSide.');
  }
  if (access.account.createdById !== owner.id) throw notFound();

  switch (input.action) {
    case 'role':
      await db.businessPlaceAccess.update({ where: { id: access.id }, data: { role: input.role } });
      return { temporaryPassword: null };

    case 'staff-name':
      if (input.staffName) await screenText(input.staffName, 'name');
      await db.businessPlaceAccess.update({
        where: { id: access.id },
        data: { staffName: input.staffName },
      });
      return { temporaryPassword: null };

    case 'reset-password': {
      // Also clears a lockout and two-step sign-in (the employee may have lost the phone).
      const password = temporaryPassword();
      await db.$transaction([
        db.businessAccount.update({
          where: { id: accountId },
          data: {
            passwordHash: await hashPassword(password),
            mustChangePassword: true,
            failedLogins: 0,
            lockedUntil: null,
            totpEnabledAt: null,
            totpSecretEnc: null,
            totpLastStep: null,
          },
        }),
        db.businessSession.updateMany({
          where: { accountId, revokedAt: null },
          data: { revokedAt: now },
        }),
      ]);
      return { temporaryPassword: password };
    }

    case 'remove': {
      await db.businessPlaceAccess.update({ where: { id: access.id }, data: { revokedAt: now } });
      const stillWorks = await db.businessPlaceAccess.count({
        where: { accountId, revokedAt: null },
      });
      if (stillWorks === 0) {
        // No places left: the login itself ends, and every open session with it.
        await db.$transaction([
          db.businessAccount.update({ where: { id: accountId }, data: { revokedAt: now } }),
          db.businessSession.updateMany({
            where: { accountId, revokedAt: null },
            data: { revokedAt: now },
          }),
        ]);
      }
      return { temporaryPassword: null };
    }
  }
}
