/**
 * Account management (P4.9, P4.10, P4.12): username, password and email changes, and
 * account deletion. Every action that changes credentials re-checks the current password,
 * and wrong guesses are rate-limited per account.
 */
import { deleteMessagesFrom } from '../social/messages';
import { normalizeUsername } from '@jax/shared';
import type { Prisma, User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import {
  decryptUserEmail,
  emailIndex,
  encryptField,
  unwrapUserKey,
  decryptField,
} from '../crypto/field-encryption';
import { db } from '../db';
import { ApiError } from '../http';
import { screenText } from '../moderation/screening';
import { sendSafely } from '../mail/mailer';
import {
  accountDeletedEmail,
  emailChangeCodeEmail,
  emailChangeNoticeEmail,
  emailChangeTakenEmail,
} from '../mail/templates';
import { assertUnder, hit } from '../rate-limit';
import { hashPassword, verifyPassword } from './crypto';
import { consumeEmailCode, issueEmailToken, type RequestContext } from './service';
import { revokeAllSessions } from './sessions';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Checks the current password; wrong guesses count toward a per-account limit. */
async function assertPassword(user: User, password: string, now: Date) {
  const rule = {
    key: `password-check:user:${user.id}`,
    limitKey: 'rateLimit.passwordCheck.per15Min' as const,
    windowSeconds: 15 * 60,
  };
  await assertUnder(rule, now);
  if (!(await verifyPassword(user.passwordHash, password))) {
    await hit(rule.key, rule.windowSeconds, now);
    throw new ApiError(403, 'WRONG_PASSWORD', 'Your current password is incorrect');
  }
}

// ───────────────────────────── Username (P4.9) ─────────────────────────────

/**
 * Changes the display name. The user ID never changes, so moderation history and bans
 * follow the person (A1, MS4). Old names are kept in UsernameHistory and stay reserved
 * for username.releaseHoldDays so nobody can pick them up to impersonate.
 */
export async function changeUsername(user: User, username: string, now = new Date()) {
  const normalized = normalizeUsername(username);
  if (normalized === user.usernameNormalized) {
    // Only capitalization changed: no cooldown, nothing to reserve.
    return db.user.update({ where: { id: user.id }, data: { username: username.trim() } });
  }
  await screenText(username, 'username'); // P5.4
  const [cooldownDays, holdDays] = await Promise.all([
    getConfig('username.changeCooldownDays'),
    getConfig('username.releaseHoldDays'),
  ]);
  if (user.usernameChangedAt) {
    const next = new Date(user.usernameChangedAt.getTime() + cooldownDays * DAY_MS);
    if (next > now) {
      throw new ApiError(
        409,
        'USERNAME_COOLDOWN',
        `You can change your username again on ${next.toDateString()}.`,
        {
          nextChangeAt: next.toISOString(),
        },
      );
    }
  }
  const heldByOther = await db.usernameHistory.findFirst({
    where: {
      userId: { not: user.id },
      changedAt: { gt: new Date(now.getTime() - holdDays * DAY_MS) },
      username: { equals: normalized, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (heldByOther) throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken');
  try {
    return await db.$transaction(async (tx) => {
      await tx.usernameHistory.create({
        data: { userId: user.id, username: user.username, changedAt: now },
      });
      return tx.user.update({
        where: { id: user.id },
        data: { username: username.trim(), usernameNormalized: normalized, usernameChangedAt: now },
      });
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken');
    }
    throw err;
  }
}

// ───────────────────────────── Password (P4.10) ─────────────────────────────

/** Changes the password and signs out every other device (this one stays signed in). */
export async function changePassword(
  user: User,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
  now = new Date(),
) {
  await assertPassword(user, currentPassword, now);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await db.session.updateMany({
    where: { userId: user.id, revokedAt: null, id: { not: currentSessionId } },
    data: { revokedAt: now },
  });
}

// ───────────────────────────── Email (P4.10) ─────────────────────────────

export const EMAIL_CHANGE_STARTED = {
  status: 'verification_sent',
  message: 'If that address can be used, we sent it a 6-digit code. Enter it to finish.',
} as const;

/**
 * Starts an email change: a code goes to the new address, and the old address is told.
 * If the new address belongs to another account, the response is the same (no
 * disclosure) and that address gets a "someone tried" notice instead.
 */
export async function startEmailChange(
  user: User,
  newEmail: string,
  password: string,
  ctx: RequestContext,
) {
  const now = ctx.now ?? new Date();
  await assertPassword(user, password, now);
  const index = emailIndex(newEmail);
  if (index === user.emailIndex) {
    throw new ApiError(400, 'SAME_EMAIL', 'That is already your email address');
  }
  const oldEmail = decryptUserEmail(user);
  const taken = await db.user.findUnique({ where: { emailIndex: index }, select: { id: true } });
  if (taken) {
    await sendSafely(emailChangeTakenEmail(newEmail), 'email-change-taken');
    return EMAIL_CHANGE_STARTED;
  }
  const dek = unwrapUserKey(user.id, user.dekWrapped!);
  const minutes = await getConfig('emailCode.expiryMinutes');
  const { code } = await issueEmailToken(
    user.id,
    'EMAIL_CHANGE',
    minutes * MINUTE_MS,
    now,
    encryptField(user.id, 'newEmail', dek, newEmail),
  );
  await sendSafely(emailChangeCodeEmail(newEmail, code), 'email-change-code');
  await sendSafely(emailChangeNoticeEmail(oldEmail, 'requested'), 'email-change-notice');
  return EMAIL_CHANGE_STARTED;
}

/** Finishes an email change with the code sent to the new address. */
export async function confirmEmailChange(user: User, code: string, ctx: RequestContext) {
  const now = ctx.now ?? new Date();
  const token = await consumeEmailCode(user.id, 'EMAIL_CHANGE', code, ctx);
  if (!token.newEmailEnc)
    throw new ApiError(400, 'INVALID_CODE', 'That code is incorrect or has expired.');
  const dek = unwrapUserKey(user.id, user.dekWrapped!);
  const newEmail = decryptField(user.id, 'newEmail', dek, token.newEmailEnc);
  const oldEmail = decryptUserEmail(user);
  try {
    await db.user.update({
      where: { id: user.id },
      data: {
        emailIndex: emailIndex(newEmail),
        emailEnc: encryptField(user.id, 'email', dek, newEmail),
        emailVerifiedAt: now, // the code proved control of the new address
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      // Someone else registered it in the meantime. Safe to say: the user proved they own it.
      throw new ApiError(409, 'EMAIL_TAKEN', 'That address is now used by another account');
    }
    throw err;
  }
  await sendSafely(emailChangeNoticeEmail(oldEmail, 'completed'), 'email-change-completed');
  return { status: 'email_changed' as const };
}

// ───────────────────────────── Deletion (P4.12) ─────────────────────────────

/**
 * Deletes the account now: login and posting stop, every session is revoked, the profile
 * disappears, favorites are removed. Posts stay but show "deleted user". The encrypted
 * email is kept for retention.deletedAccountDays (D37), then crypto-shredded by the
 * maintenance job unless a legal hold is set.
 */
export async function deleteAccount(user: User, password: string, now = new Date()) {
  await assertPassword(user, password, now);
  const days = await getConfig('retention.deletedAccountDays');
  const email = decryptUserEmail(user);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { status: 'DELETED', deletedAt: now },
    });
    await tx.profile.updateMany({ where: { userId: user.id }, data: { bio: null } });
    await tx.favoritePlace.deleteMany({ where: { userId: user.id } });
    // D98: every private message they sent goes (reports keep their snapshot).
    await deleteMessagesFrom(tx, user.id);
    await tx.accountDeletion.create({
      data: {
        userId: user.id,
        requestedAt: now,
        purgeAfter: new Date(now.getTime() + days * DAY_MS),
      },
    });
  });
  await revokeAllSessions(user.id, now);
  await sendSafely(accountDeletedEmail(email, days), 'account-deleted');
}

/**
 * Maintenance step (D37): crypto-shreds accounts whose retention period has passed and
 * that aren't on legal hold. The data key and encrypted email are destroyed (backups
 * become unreadable too), the lookup hash is dropped, and the username is freed.
 */
export async function purgeDeletedAccounts(
  now = new Date(),
  client: Prisma.TransactionClient = db,
): Promise<number> {
  const due = await client.accountDeletion.findMany({
    where: {
      status: { in: ['REQUESTED', 'PROCESSING'] },
      purgeAfter: { lt: now },
      user: { legalHoldAt: null },
    },
    select: { id: true, userId: true },
  });
  for (const d of due) {
    const placeholder = `deleted_${d.userId.replace(/-/g, '').slice(-10)}`;
    await client.user.update({
      where: { id: d.userId },
      data: {
        emailEnc: null,
        dekWrapped: null,
        emailIndex: null,
        passwordHash: '!',
        username: placeholder,
        usernameNormalized: placeholder,
      },
    });
    await client.profile.updateMany({
      where: { userId: d.userId },
      data: { bio: null, avatarPhotoId: null },
    });
    await client.adminCredential.deleteMany({ where: { userId: d.userId } }); // D108
    await client.userSettings.deleteMany({ where: { userId: d.userId } });
    await client.locationCheck.deleteMany({ where: { userId: d.userId } });

    await client.emailToken.deleteMany({ where: { userId: d.userId } });
    await client.accountDeletion.update({
      where: { id: d.id },
      data: { status: 'COMPLETED', completedAt: now },
    });
  }
  return due.length;
}
