import {
  TOS_VERSION,
  currentYearInAppTimeZone,
  isBirthYearEligible,
  maxEligibleBirthYear,
  normalizeUsername,
  type LoginRequest,
  type RegisterRequest,
} from '@jax/shared';
import type { EmailToken, EmailTokenPurpose, Installation } from '@/generated/prisma/client';
import { assertInstallationNotBanned } from '../installations';
import { getConfig } from '../config';
import { db } from '../db';
import { getEnv } from '../env';
import { ApiError } from '../http';
import { sendSafely } from '../mail/mailer';
import { passwordResetEmail, registrationAttemptEmail, verificationEmail } from '../mail/templates';
import { decryptUserEmail, emailIndex, encryptedEmailFields } from '../crypto/field-encryption';
import { uuidv7 } from '../crypto/uuid';
import { assertUnder, enforce, hit } from '../rate-limit';
import { toMe } from '../serializers';
import {
  burnPasswordCheck,
  generateEmailCode,
  generateToken,
  hashEmailCode,
  safeEqualHex,
  hashPassword,
  hashToken,
  keyedHash,
  verifyPassword,
} from './crypto';
import { createSession, revokeAllSessions } from './sessions';
import { assertAccountUsable } from './standing';

const HOUR = 3600;
const MINUTE_MS = 60_000;

export interface RequestContext {
  /** Keyed hash of the client IP (see client-ip.ts). */
  ipSubject: string;
  /** The app installation making the request, if it sent its token (P2.7). */
  installation?: Installation | null;
  now?: Date;
}

/** Identical response for new and already-registered emails, so registration can't probe accounts. */
export const REGISTER_ACCEPTED = {
  status: 'verification_sent',
  message: 'Check your email to confirm your address, then sign in.',
} as const;

export const RESET_REQUESTED = {
  status: 'reset_requested',
  message: 'If an account uses that email, we sent a reset link.',
} as const;

const INVALID_CREDENTIALS = () =>
  new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect username/email or password');

function subjectHash(value: string): string {
  return keyedHash(value, getEnv().SESSION_SECRET);
}

function isUniqueViolation(err: unknown, field: string): boolean {
  const e = err as { code?: string };
  return e?.code === 'P2002' && JSON.stringify(err).includes(field);
}

// ───────────────────────────── Age (P1.14) ─────────────────────────────

/**
 * Server-side 18+ screen (§4.2). The offset comes from AppConfiguration.
 * Returns the cutoff year the user passed, which is stored instead of the birth year (D36).
 */
export async function assertAgeEligible(birthYear: number, now = new Date()): Promise<number> {
  const offset = await getConfig('age.birthYearOffset');
  const year = currentYearInAppTimeZone(now);
  if (!isBirthYearEligible(birthYear, year, offset)) {
    const max = maxEligibleBirthYear(year, offset);
    throw new ApiError(
      422,
      'AGE_INELIGIBLE',
      `Jax is for adults 18 and older. Because we only ask for birth year, ` +
        `accounts are open to people born in ${max} or earlier.`,
      { maxBirthYear: max },
    );
  }
  return maxEligibleBirthYear(year, offset);
}

// ─────────────────────────── Email tokens ───────────────────────────

/**
 * One emailed credential with two ways to use it (D31): a long link token and a
 * 6-digit code for typing into the app. Using either one consumes the row.
 */
export async function issueEmailToken(
  userId: string,
  purpose: EmailTokenPurpose,
  ttlMs: number,
  now: Date,
  /** EMAIL_CHANGE only: the new address, already encrypted with the user's key (D35). */
  newEmailEnc?: Uint8Array<ArrayBuffer>,
): Promise<{ token: string; code: string }> {
  const token = generateToken();
  const code = generateEmailCode();
  const codeMinutes = await getConfig('emailCode.expiryMinutes');
  await db.$transaction([
    // Only the newest email of each kind works.
    db.emailToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    }),
    db.emailToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        codeHash: hashEmailCode(code, getEnv().SESSION_SECRET),
        codeExpiresAt: new Date(now.getTime() + Math.min(ttlMs, codeMinutes * MINUTE_MS)),
        newEmailEnc: newEmailEnc ?? null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + ttlMs),
      },
    }),
  ]);
  return { token, code };
}

const INVALID_CODE = () =>
  new ApiError(400, 'INVALID_CODE', 'That code is incorrect or has expired. Request a new one.');

/**
 * Checks a typed code for a known user and consumes the token on success (D31).
 * Each token allows emailCode.maxAttempts wrong guesses, then it is dead. Wrong
 * guesses also count per IP, across all accounts. The error never says how many
 * tries are left, so reset-by-code can't reveal whether an account exists.
 */
export async function consumeEmailCode(
  userId: string | null,
  purpose: EmailTokenPurpose,
  code: string,
  ctx: RequestContext,
): Promise<EmailToken> {
  const now = ctx.now ?? new Date();
  const ipRule = {
    key: `code-fail:ip:${ctx.ipSubject}`,
    limitKey: 'rateLimit.codeAttempt.per15MinPerIp' as const,
    windowSeconds: 15 * 60,
  };
  await assertUnder(ipRule, now);
  const fail = async () => {
    await hit(ipRule.key, ipRule.windowSeconds, now);
    return INVALID_CODE();
  };

  const maxAttempts = await getConfig('emailCode.maxAttempts');
  const row = userId
    ? await db.emailToken.findFirst({
        where: {
          userId,
          purpose,
          usedAt: null,
          expiresAt: { gt: now },
          codeExpiresAt: { gt: now },
          codeAttempts: { lt: maxAttempts },
        },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  if (!row?.codeHash) throw await fail();

  if (!safeEqualHex(row.codeHash, hashEmailCode(code, getEnv().SESSION_SECRET))) {
    // Atomic increment; the guard stops parallel guesses from exceeding the cap.
    await db.emailToken.updateMany({
      where: { id: row.id, usedAt: null, codeAttempts: { lt: maxAttempts } },
      data: { codeAttempts: { increment: 1 } },
    });
    await db.emailToken.updateMany({
      where: { id: row.id, usedAt: null, codeAttempts: { gte: maxAttempts } },
      data: { usedAt: now },
    });
    throw await fail();
  }

  const consumed = await db.emailToken.updateMany({
    where: { id: row.id, usedAt: null, codeAttempts: { lt: maxAttempts } },
    data: { usedAt: now },
  });
  if (consumed.count !== 1) throw await fail();
  return row;
}

/** Marks a token used exactly once (race-safe) and returns its owner. */
async function consumeEmailToken(token: string, purpose: EmailTokenPurpose, now: Date) {
  const tokenHash = hashToken(token);
  const res = await db.emailToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (res.count !== 1) {
    throw new ApiError(400, 'INVALID_TOKEN', 'This link is invalid or has expired');
  }
  const row = await db.emailToken.findUniqueOrThrow({
    where: { tokenHash },
    include: { user: true },
  });
  return row.user;
}

async function sendVerification(userId: string, email: string, now: Date) {
  const hours = await getConfig('emailVerification.expiryHours');
  const { token, code } = await issueEmailToken(
    userId,
    'VERIFY_EMAIL',
    hours * 60 * MINUTE_MS,
    now,
  );
  await sendSafely(verificationEmail(email, getEnv().APP_BASE_URL, token, code), 'verify-email');
}

// ─────────────────────────── Register (P1.13) ───────────────────────────

export async function register(input: RegisterRequest, ctx: RequestContext) {
  const now = ctx.now ?? new Date();
  await enforce(
    [
      {
        key: `register:ip:${ctx.ipSubject}`,
        limitKey: 'rateLimit.register.perHourPerIp',
        windowSeconds: HOUR,
      },
    ],
    now,
  );
  assertInstallationNotBanned(ctx.installation ?? null);
  // The birth year is used here and never stored (D36).
  const ageCutoffYear = await assertAgeEligible(input.birthYear, now);

  const usernameNormalized = normalizeUsername(input.username);
  if (await db.user.findUnique({ where: { usernameNormalized }, select: { id: true } })) {
    throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken');
  }

  // Hash before the email check so both paths take the same time.
  const passwordHash = await hashPassword(input.password);

  // Look up by keyed hash; the email itself is never stored in plaintext (D35).
  const index = emailIndex(input.email);
  const existing = await db.user.findUnique({
    where: { emailIndex: index },
    select: { id: true },
  });
  if (existing) {
    await sendSafely(
      registrationAttemptEmail(input.email, getEnv().APP_BASE_URL),
      'register-existing',
    );
    return REGISTER_ACCEPTED;
  }

  // The ID is chosen here so the encrypted email can be bound to it.
  const userId = uuidv7(now.getTime());
  try {
    await db.user.create({
      data: {
        id: userId,
        username: input.username.trim(),
        usernameNormalized,
        ...encryptedEmailFields(userId, input.email),
        passwordHash,
        ageCutoffYear,
        tosAcceptedAt: now,
        tosVersion: TOS_VERSION,
        adultConfirmedAt: now,
        profile: { create: {} },
      },
      select: { id: true },
    });
  } catch (err) {
    // Lost a race with a concurrent registration.
    if (isUniqueViolation(err, 'usernameNormalized')) {
      throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken');
    }
    if (isUniqueViolation(err, 'emailIndex')) return REGISTER_ACCEPTED;
    throw err;
  }

  await sendVerification(userId, input.email, now);
  return REGISTER_ACCEPTED;
}

// ───────────────────────────── Login (P1.15) ─────────────────────────────

export async function login(input: LoginRequest, ctx: RequestContext) {
  const now = ctx.now ?? new Date();
  const identifier = input.identifier.trim().toLowerCase();
  const accountRule = {
    key: `login-fail:acct:${subjectHash(identifier)}`,
    limitKey: 'rateLimit.login.per15MinPerAccount' as const,
    windowSeconds: 15 * 60,
  };

  const ipRule = {
    key: `login-fail:ip:${ctx.ipSubject}`,
    limitKey: 'rateLimit.login.per15MinPerIp' as const,
    windowSeconds: 15 * 60,
  };

  // Both limits count FAILED attempts only (D29). Successful logins never count, so
  // people sharing one IP (carrier NAT, café wifi) aren't blocked by each other's
  // normal sign-ins, and a user who knows their password isn't locked out.
  await assertUnder(ipRule, now);
  await assertUnder(accountRule, now);
  assertInstallationNotBanned(ctx.installation ?? null);

  const fail = async () => {
    await hit(ipRule.key, ipRule.windowSeconds, now);
    await hit(accountRule.key, accountRule.windowSeconds, now);
    return INVALID_CREDENTIALS();
  };

  const user = await db.user.findUnique({
    where: identifier.includes('@')
      ? { emailIndex: emailIndex(identifier) }
      : { usernameNormalized: identifier },
    include: { profile: true },
  });

  const deleted = !user || user.status === 'DELETED' || user.deletedAt !== null;
  if (deleted) {
    await burnPasswordCheck(input.password);
    throw await fail();
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw await fail();
  }

  // Correct password: now it's safe to say the account is banned or suspended.
  assertAccountUsable(user, now);

  const { token, expiresAt } = await createSession(
    user.id,
    'MOBILE',
    now,
    ctx.installation?.id ?? null,
  );
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: toMe({ ...user, email: decryptUserEmail(user) }),
  };
}

// ─────────────────────── Email verification (P1.16) ───────────────────────

export async function verifyEmail(token: string, now = new Date()) {
  const user = await consumeEmailToken(token, 'VERIFY_EMAIL', now);
  if (user.status === 'DELETED' || user.deletedAt) {
    throw new ApiError(400, 'INVALID_TOKEN', 'This link is invalid or has expired');
  }
  if (!user.emailVerifiedAt) {
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
  }
  return { status: 'verified' as const };
}

/** D31: the signed-in user types the 6-digit code from their email into the app. */
export async function verifyEmailByCode(
  user: { id: string; emailVerifiedAt: Date | null },
  code: string,
  ctx: RequestContext,
) {
  if (user.emailVerifiedAt) return { status: 'already_verified' as const };
  const now = ctx.now ?? new Date();
  await consumeEmailCode(user.id, 'VERIFY_EMAIL', code, ctx);
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
  return { status: 'verified' as const };
}

export async function resendVerification(
  user: {
    id: string;
    emailVerifiedAt: Date | null;
    dekWrapped: Uint8Array | null;
    emailEnc: Uint8Array | null;
  },
  now = new Date(),
) {
  if (user.emailVerifiedAt) return { status: 'already_verified' as const };
  await enforce(
    [
      {
        key: `verify-resend:user:${user.id}`,
        limitKey: 'rateLimit.verifyEmailResend.perHour',
        windowSeconds: HOUR,
      },
    ],
    now,
  );
  await sendVerification(user.id, decryptUserEmail(user), now);
  return { status: 'verification_sent' as const };
}

// ─────────────────────────── Password reset (P1.17) ───────────────────────────

export async function requestPasswordReset(email: string, ctx: RequestContext) {
  const now = ctx.now ?? new Date();
  await enforce(
    [
      {
        key: `reset:ip:${ctx.ipSubject}`,
        limitKey: 'rateLimit.passwordReset.perHourPerIp',
        windowSeconds: HOUR,
      },
    ],
    now,
  );

  const user = await db.user.findUnique({ where: { emailIndex: emailIndex(email) } });
  if (!user || user.status === 'DELETED' || user.deletedAt) return RESET_REQUESTED;

  // Per-account cap stops an attacker from mail-bombing someone. Over the cap,
  // respond the same way but send nothing.
  const sent = await hit(`reset:acct:${user.id}`, HOUR, now);
  if (sent > (await getConfig('rateLimit.passwordReset.perHourPerAccount'))) {
    return RESET_REQUESTED;
  }

  const minutes = await getConfig('passwordReset.expiryMinutes');
  const { token, code } = await issueEmailToken(
    user.id,
    'PASSWORD_RESET',
    minutes * MINUTE_MS,
    now,
  );
  await sendSafely(
    passwordResetEmail(decryptUserEmail(user), getEnv().APP_BASE_URL, token, code),
    'password-reset',
  );
  return RESET_REQUESTED;
}

async function finishPasswordReset(
  user: { id: string; emailVerifiedAt: Date | null },
  newPassword: string,
  now: Date,
) {
  const passwordHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id: user.id },
    // Using the emailed link or code proves control of the address.
    data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
  });
  // Anyone holding an old session is signed out.
  await revokeAllSessions(user.id, now);
  return { status: 'password_reset' as const };
}

export async function confirmPasswordReset(token: string, newPassword: string, now = new Date()) {
  const user = await consumeEmailToken(token, 'PASSWORD_RESET', now);
  if (user.status === 'DELETED' || user.deletedAt) {
    throw new ApiError(400, 'INVALID_TOKEN', 'This link is invalid or has expired');
  }
  return finishPasswordReset(user, newPassword, now);
}

/** D31: reset inside the app with the emailed 6-digit code. */
export async function confirmPasswordResetByCode(
  input: { email: string; code: string; newPassword: string },
  ctx: RequestContext,
) {
  const now = ctx.now ?? new Date();
  const user = await db.user.findUnique({ where: { emailIndex: emailIndex(input.email) } });
  const usable = user && user.status !== 'DELETED' && !user.deletedAt;
  // Unknown and deleted accounts take the same path and get the same error.
  await consumeEmailCode(usable ? user.id : null, 'PASSWORD_RESET', input.code, ctx);
  return finishPasswordReset(user!, input.newPassword, now);
}
