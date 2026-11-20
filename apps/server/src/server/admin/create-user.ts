import type { z } from 'zod';
import {
  currentYearInAppTimeZone,
  maxEligibleBirthYear,
  normalizeUsername,
  randomProfileColor,
  TOS_VERSION,
  type adminCreateUserSchema,
} from '@jax/shared';
import { hashPassword } from '../auth/crypto';
import { getConfig } from '../config';
import { createUserKey, emailIndex, encryptedEmailFields } from '../crypto/field-encryption';
import { uuidv7 } from '../crypto/uuid';
import { db } from '../db';
import { ApiError } from '../http';
import { screenText } from '../moderation/screening';
import { audit } from './audit';

type Input = z.infer<typeof adminCreateUserSchema>;

const taken = (err: unknown, field: string) => {
  const e = err as { code?: string };
  return e?.code === 'P2002' && JSON.stringify(err).includes(field);
};

/**
 * D273: an admin adds an account (store reviewers, staff, test accounts). The same username
 * and password rules as sign-up; the email is optional; the account is confirmed at once and
 * marked `adminCreated`. The admin confirmed the person is 18+ and agrees to the Terms, so
 * they're recorded as accepted now (and audited with who). Never an admin account.
 *
 * Unlike sign-up, a taken username or email is said plainly: only admins see this.
 */
export async function adminCreateUser(adminId: string, input: Input, now = new Date()) {
  await screenText(input.username, 'username');
  const usernameNormalized = normalizeUsername(input.username);
  const email = input.email?.trim().toLowerCase() || null;
  const [nameTaken, emailTaken] = await Promise.all([
    db.user.findUnique({ where: { usernameNormalized }, select: { id: true } }),
    email
      ? db.user.findUnique({ where: { emailIndex: emailIndex(email) }, select: { id: true } })
      : null,
  ]);
  if (nameTaken) throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken');
  if (emailTaken) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'Another account already uses that email');
  }

  // The same cutoff sign-up stores for someone who just passed the age check (D36).
  const ageCutoffYear = maxEligibleBirthYear(
    currentYearInAppTimeZone(now),
    await getConfig('age.birthYearOffset'),
  );
  const id = uuidv7(now.getTime());
  // With no email the account still gets its own data key, so an email can be added later.
  const emailFields = email
    ? encryptedEmailFields(id, email)
    : { dekWrapped: createUserKey(id).wrapped };
  try {
    await db.user.create({
      data: {
        id,
        username: input.username.trim(),
        usernameNormalized,
        ...emailFields,
        passwordHash: await hashPassword(input.password),
        ageCutoffYear,
        tosAcceptedAt: now,
        tosVersion: TOS_VERSION,
        adultConfirmedAt: now,
        emailVerifiedAt: now,
        adminCreated: true,
        reviewAccount: input.reviewAccount,
        profile: { create: { color: randomProfileColor() } },
      },
      select: { id: true },
    });
  } catch (err) {
    if (taken(err, 'usernameNormalized')) {
      throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken');
    }
    if (taken(err, 'emailIndex')) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'Another account already uses that email');
    }
    throw err;
  }
  await audit(
    adminId,
    'USER_CREATED',
    { type: 'user', id },
    { withEmail: !!email, reviewAccount: input.reviewAccount, confirmedAdultAndTerms: true },
  );
  return { id, username: input.username.trim() };
}
