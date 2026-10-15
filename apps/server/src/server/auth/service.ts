import {
  TOS_VERSION,
  currentYearInAppTimeZone,
  isBirthYearEligible,
  maxEligibleBirthYear,
  normalizeUsername,
  type LoginRequest,
  type RegisterRequest,
} from '@jax/shared';
import type { EmailTokenPurpose } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { getEnv } from '../env';
import { ApiError } from '../http';
import { sendSafely } from '../mail/mailer';
import { passwordResetEmail, registrationAttemptEmail, verificationEmail } from '../mail/templates';
import { assertUnder, enforce, hit } from '../rate-limit';
import { toMe } from '../serializers';
import {
  burnPasswordCheck,
  generateToken,
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

/** Server-side 18+ screen (§4.2). The offset comes from AppConfiguration. */
export async function assertAgeEligible(birthYear: number, now = new Date()): Promise<void> {
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
}

// ─────────────────────────── Email tokens ───────────────────────────

async function issueEmailToken(
  userId: string,
  purpose: EmailTokenPurpose,
  ttlMs: number,
  now: Date,
): Promise<string> {
  const token = generateToken();
  await db.$transaction([
    // Only the newest link of each kind works.
    db.emailToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    }),
    db.emailToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        createdAt: now,
        expiresAt: new Date(now.getTime() + ttlMs),
      },
    }),
  ]);
  return token;
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
  const token = await issueEmailToken(userId, 'VERIFY_EMAIL', hours * 60 * MINUTE_MS, now);
  await sendSafely(verificationEmail(email, getEnv().APP_BASE_URL, token), 'verify-email');
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
  await assertAgeEligible(input.birthYear, now);

  const usernameNormalized = normalizeUsername(input.username);
  if (await db.user.findUnique({ where: { usernameNormalized }, select: { id: true } })) {
    throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken');
  }

  // Hash before the email check so both paths take the same time.
  const passwordHash = await hashPassword(input.password);

  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    await sendSafely(
      registrationAttemptEmail(input.email, getEnv().APP_BASE_URL),
      'register-existing',
    );
    return REGISTER_ACCEPTED;
  }

  let userId: string;
  try {
    const user = await db.user.create({
      data: {
        username: input.username.trim(),
        usernameNormalized,
        email: input.email,
        passwordHash,
        birthYear: input.birthYear,
        tosAcceptedAt: now,
        tosVersion: TOS_VERSION,
        adultConfirmedAt: now,
        profile: { create: {} },
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (err) {
    // Lost a race with a concurrent registration.
    if (isUniqueViolation(err, 'usernameNormalized')) {
      throw new ApiError(409, 'USERNAME_TAKEN', 'That username is taken');
    }
    if (isUniqueViolation(err, 'email')) return REGISTER_ACCEPTED;
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

  // Per IP: every attempt counts. Per account: only failures count, so a user
  // who knows their password isn't locked out by successful logins.
  await enforce(
    [
      {
        key: `login:ip:${ctx.ipSubject}`,
        limitKey: 'rateLimit.login.per15MinPerIp',
        windowSeconds: 15 * 60,
      },
    ],
    now,
  );
  await assertUnder(accountRule, now);

  const user = await db.user.findUnique({
    where: identifier.includes('@') ? { email: identifier } : { usernameNormalized: identifier },
    include: { profile: true },
  });

  const deleted = !user || user.status === 'DELETED' || user.deletedAt !== null;
  if (deleted) {
    await burnPasswordCheck(input.password);
    await hit(accountRule.key, accountRule.windowSeconds, now);
    throw INVALID_CREDENTIALS();
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    await hit(accountRule.key, accountRule.windowSeconds, now);
    throw INVALID_CREDENTIALS();
  }

  // Correct password: now it's safe to say the account is banned or suspended.
  assertAccountUsable(user, now);

  const { token, expiresAt } = await createSession(user.id, 'MOBILE', now);
  return { token, expiresAt: expiresAt.toISOString(), user: toMe(user) };
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

export async function resendVerification(
  user: { id: string; email: string; emailVerifiedAt: Date | null },
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
  await sendVerification(user.id, user.email, now);
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

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status === 'DELETED' || user.deletedAt) return RESET_REQUESTED;

  // Per-account cap stops an attacker from mail-bombing someone. Over the cap,
  // respond the same way but send nothing.
  const sent = await hit(`reset:acct:${user.id}`, HOUR, now);
  if (sent > (await getConfig('rateLimit.passwordReset.perHourPerAccount'))) {
    return RESET_REQUESTED;
  }

  const minutes = await getConfig('passwordReset.expiryMinutes');
  const token = await issueEmailToken(user.id, 'PASSWORD_RESET', minutes * MINUTE_MS, now);
  await sendSafely(passwordResetEmail(user.email, getEnv().APP_BASE_URL, token), 'password-reset');
  return RESET_REQUESTED;
}

export async function confirmPasswordReset(token: string, newPassword: string, now = new Date()) {
  const user = await consumeEmailToken(token, 'PASSWORD_RESET', now);
  if (user.status === 'DELETED' || user.deletedAt) {
    throw new ApiError(400, 'INVALID_TOKEN', 'This link is invalid or has expired');
  }
  const passwordHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id: user.id },
    // Using the emailed link proves control of the address.
    data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
  });
  // Anyone holding an old session is signed out.
  await revokeAllSessions(user.id, now);
  return { status: 'password_reset' as const };
}
