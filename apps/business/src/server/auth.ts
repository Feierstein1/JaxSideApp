import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { BusinessAccount, BusinessSession } from '@/generated/prisma/client';
import {
  burnPasswordCheck,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from './crypto';
import { db } from './db';
import { getEnv } from './env';
import { ApiError } from './http';
import { LIMITS, clientIp, enforce, subject } from './rate-limit';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  matchTotp,
  otpauthUrl,
} from './totp';

/**
 * Business website sign-in (D169, B1.2). A session is an httpOnly, SameSite=Strict cookie
 * plus a CSRF token the pages echo in a header. Sessions live in their own table, so a
 * token from the phone app is never a valid business session, and the other way round.
 *
 * 1. Email (owners) or username (employees) + password. Per-IP and per-name rate limits,
 *    and a lockout after repeated wrong passwords.
 * 2. If the account turned on two-factor: the 6-digit authenticator code, carried by a
 *    short-lived signed challenge from step 1.
 * A new employee (or a reset password) must choose a new password before anything else.
 */

export const SESSION_COOKIE = 'jax_biz';
export const CSRF_COOKIE = 'jax_biz_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export const SESSION_HOURS = 12;
export const IDLE_MINUTES = 60;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const CHALLENGE_TTL_MS = 5 * 60_000;
const MINUTE_MS = 60_000;

const badLogin = () =>
  new ApiError(401, 'INVALID_LOGIN', 'That sign-in name or password is not right.');
const signedOut = () => new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
const suspended = () =>
  new ApiError(403, 'SUSPENDED', 'This account is suspended. Please contact JaxSide.');
const badCode = () =>
  new ApiError(401, 'INVALID_CODE', 'That code didn’t work. Check your authenticator app.');

export type SessionGrant = { token: string; csrfToken: string; expiresAt: Date };
export type LoginResult =
  | ({ kind: 'session'; account: BusinessAccount } & SessionGrant)
  | { kind: 'twoFactor'; challenge: string };

// ───────────────────────────── Step 1 ─────────────────────────────

export async function login(
  input: { identifier: string; password: string },
  req: Request,
  now = new Date(),
): Promise<LoginResult> {
  await enforce(
    [
      { key: `login:ip:${subject(clientIp(req))}`, ...LIMITS.loginPerIp },
      { key: `login:name:${subject(input.identifier)}`, ...LIMITS.loginPerIdentifier },
    ],
    now,
  );
  const account = await db.businessAccount.findFirst({
    where: input.identifier.includes('@')
      ? { email: input.identifier }
      : { username: input.identifier },
  });
  if (!account || account.revokedAt) {
    await burnPasswordCheck(input.password);
    throw badLogin();
  }
  if (account.lockedUntil && account.lockedUntil > now) {
    throw new ApiError(429, 'LOCKED', 'Too many tries. Please wait a while and try again.');
  }
  if (!(await verifyPassword(account.passwordHash, input.password))) {
    const failed = account.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.businessAccount.update({
      where: { id: account.id },
      data: {
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * MINUTE_MS) : null,
      },
    });
    throw badLogin();
  }
  if (account.failedLogins || account.lockedUntil) {
    await db.businessAccount.update({
      where: { id: account.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }
  // Only said after the right password, so it doesn't reveal which accounts exist.
  if (account.suspendedAt) throw suspended();
  if (account.totpEnabledAt)
    return { kind: 'twoFactor', challenge: makeChallenge(account.id, now) };
  return { kind: 'session', account, ...(await createSession(account.id, now)) };
}

// ───────────────────────────── Step 2 ─────────────────────────────

function sign(payload: string): string {
  return createHmac('sha256', getEnv().BUSINESS_SECRET)
    .update(`login-challenge:${payload}`)
    .digest('base64url');
}

function makeChallenge(accountId: string, now: Date): string {
  const payload = `${accountId}.${now.getTime() + CHALLENGE_TTL_MS}.${randomBytes(8).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}

function readChallenge(challenge: string, now: Date): string {
  const parts = challenge.split('.');
  const bad = () => new ApiError(401, 'CHALLENGE_EXPIRED', 'Please sign in again.');
  if (parts.length !== 4) throw bad();
  const payload = parts.slice(0, 3).join('.');
  const given = Buffer.from(parts[3]!);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw bad();
  if (Number(parts[1]) < now.getTime()) throw bad();
  return parts[0]!;
}

/** Accepts a code once: the step must be newer than the last one used (no replay). */
async function useTotpCode(account: BusinessAccount, code: string, now: Date): Promise<number> {
  if (!account.totpSecretEnc) throw badCode();
  const step = matchTotp(decryptTotpSecret(account.id, account.totpSecretEnc), code, now);
  if (step === null) throw badCode();
  const claimed = await db.businessAccount.updateMany({
    where: {
      id: account.id,
      OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
    },
    data: { totpLastStep: step },
  });
  if (claimed.count !== 1) throw badCode();
  return step;
}

export async function completeTwoFactorLogin(
  input: { challenge: string; code: string },
  now = new Date(),
): Promise<Extract<LoginResult, { kind: 'session' }>> {
  const accountId = readChallenge(input.challenge, now);
  await enforce([{ key: `2fa:acct:${accountId}`, ...LIMITS.twoFactorPerAccount }], now);
  const account = await db.businessAccount.findUnique({ where: { id: accountId } });
  if (!account || account.revokedAt || !account.totpEnabledAt) throw signedOut();
  if (account.suspendedAt) throw suspended();
  await useTotpCode(account, input.code, now);
  return { kind: 'session', account, ...(await createSession(account.id, now)) };
}

export async function createSession(accountId: string, now: Date): Promise<SessionGrant> {
  const token = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * MINUTE_MS);
  await db.businessSession.create({
    data: {
      accountId,
      tokenHash: hashToken(token),
      csrfTokenHash: hashToken(csrfToken),
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    },
  });
  return { token, csrfToken, expiresAt };
}

export async function logout(session: BusinessSession) {
  await db.businessSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
}

// ───────────────────────────── Guard ─────────────────────────────

export type GuardOptions = {
  csrf?: string | null;
  mutation: boolean;
  /** Only sign-out, "who am I" and the password change itself work before a forced change. */
  allowPasswordChange?: boolean;
};

/**
 * The guard for every signed-in page and route. Checks the cookie session is live (not
 * expired, idle or revoked) for an account that isn't revoked or suspended; for changes
 * (`mutation`), also the CSRF token.
 */
export async function accountFromToken(
  token: string | null,
  opts: GuardOptions,
  now = new Date(),
): Promise<{ account: BusinessAccount; session: BusinessSession }> {
  if (!token) throw signedOut();
  const found = await db.businessSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { account: true },
  });
  if (!found || found.revokedAt || found.expiresAt <= now) throw signedOut();
  if (now.getTime() - found.lastUsedAt.getTime() > IDLE_MINUTES * MINUTE_MS) {
    await db.businessSession.update({ where: { id: found.id }, data: { revokedAt: now } });
    throw signedOut();
  }
  const { account, ...session } = found;
  if (account.revokedAt) throw signedOut();
  if (account.suspendedAt) throw suspended();

  if (opts.mutation) {
    const given = opts.csrf ? Buffer.from(hashToken(opts.csrf)) : null;
    const expected = Buffer.from(session.csrfTokenHash);
    if (!given || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ApiError(403, 'CSRF', 'Your session expired. Reload the page.');
    }
  }
  if (account.mustChangePassword && !opts.allowPasswordChange) {
    throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Please choose a new password first.');
  }
  // Idle tracking: refresh at most once a minute.
  if (now.getTime() - session.lastUsedAt.getTime() > MINUTE_MS) {
    await db.businessSession.update({ where: { id: session.id }, data: { lastUsedAt: now } });
  }
  return { account, session };
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return null;
}

/**
 * Changes must come from this site: if the browser sent an Origin, it has to match Host.
 * (SameSite=Strict already stops cross-site cookies; this also protects the sign-in form.)
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw new ApiError(403, 'CSRF', 'Request not allowed.');
  }
  if (host !== req.headers.get('host')) throw new ApiError(403, 'CSRF', 'Request not allowed.');
}

/**
 * The business guard for /api routes: cookies only (Bearer tokens are ignored). Changes
 * also need the CSRF token, a same-site Origin, and count against a per-account limit.
 */
export async function requireBusiness(
  req: Request,
  opts: { allowPasswordChange?: boolean } = {},
  now = new Date(),
) {
  const mutation = !['GET', 'HEAD'].includes(req.method);
  if (mutation) assertSameOrigin(req);
  const result = await accountFromToken(
    readCookie(req, SESSION_COOKIE),
    { csrf: req.headers.get(CSRF_HEADER), mutation, ...opts },
    now,
  );
  if (mutation) {
    await enforce([{ key: `write:acct:${result.account.id}`, ...LIMITS.writePerAccount }], now);
  }
  return result;
}

export function sessionCookies(grant: SessionGrant): string[] {
  const secure = getEnv().NODE_ENV === 'production' ? '; Secure' : '';
  const exp = `; Expires=${grant.expiresAt.toUTCString()}`;
  return [
    `${SESSION_COOKIE}=${grant.token}; Path=/; HttpOnly; SameSite=Strict${secure}${exp}`,
    // Readable by the site's own scripts, which echo it in the CSRF header.
    `${CSRF_COOKIE}=${grant.csrfToken}; Path=/; SameSite=Strict${secure}${exp}`,
  ];
}

export function clearedCookies(): string[] {
  const gone = '; Path=/; SameSite=Strict; Max-Age=0';
  return [`${SESSION_COOKIE}=${gone}; HttpOnly`, `${CSRF_COOKIE}=${gone}`];
}

// ───────────────────────────── Password ─────────────────────────────

/** Sets a new password; every other session of the account is signed out. */
export async function changePassword(
  account: BusinessAccount,
  session: BusinessSession,
  input: { currentPassword: string; newPassword: string },
  now = new Date(),
) {
  await enforce([{ key: `pw:acct:${account.id}`, ...LIMITS.passwordChangePerAccount }], now);
  if (!(await verifyPassword(account.passwordHash, input.currentPassword))) {
    throw new ApiError(400, 'WRONG_PASSWORD', 'Your current password is not right.');
  }
  await db.$transaction([
    db.businessAccount.update({
      where: { id: account.id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        mustChangePassword: false,
        passwordChangedAt: now,
      },
    }),
    db.businessSession.updateMany({
      where: { accountId: account.id, revokedAt: null, id: { not: session.id } },
      data: { revokedAt: now },
    }),
  ]);
}

// ───────────────────────────── Two-factor ─────────────────────────────

/** Starts (or restarts) set-up: a new secret, stored encrypted, not on until confirmed. */
export async function startTwoFactorSetup(account: BusinessAccount) {
  if (account.totpEnabledAt) {
    throw new ApiError(409, 'ALREADY_ON', 'Two-step sign-in is already on.');
  }
  const secret = generateTotpSecret();
  await db.businessAccount.update({
    where: { id: account.id },
    data: { totpSecretEnc: encryptTotpSecret(account.id, secret), totpLastStep: null },
  });
  return { secret, otpauthUrl: otpauthUrl(secret, account.email ?? account.username ?? '') };
}

export async function confirmTwoFactor(account: BusinessAccount, code: string, now = new Date()) {
  if (account.totpEnabledAt) {
    throw new ApiError(409, 'ALREADY_ON', 'Two-step sign-in is already on.');
  }
  await enforce([{ key: `2fa:acct:${account.id}`, ...LIMITS.twoFactorPerAccount }], now);
  await useTotpCode(account, code, now);
  await db.businessAccount.update({ where: { id: account.id }, data: { totpEnabledAt: now } });
}

/** Turning it off needs both the password and a current code. */
export async function disableTwoFactor(
  account: BusinessAccount,
  input: { password: string; code: string },
  now = new Date(),
) {
  if (!account.totpEnabledAt) throw new ApiError(409, 'ALREADY_OFF', 'Two-step sign-in is off.');
  await enforce([{ key: `2fa:acct:${account.id}`, ...LIMITS.twoFactorPerAccount }], now);
  if (!(await verifyPassword(account.passwordHash, input.password))) {
    throw new ApiError(400, 'WRONG_PASSWORD', 'Your password is not right.');
  }
  await useTotpCode(account, input.code, now);
  await db.businessAccount.update({
    where: { id: account.id },
    data: { totpEnabledAt: null, totpSecretEnc: null, totpLastStep: null },
  });
}

/** What the signed-in account may see about itself. Never the hash or the 2FA secret. */
export function accountView(account: BusinessAccount) {
  return {
    id: account.id,
    email: account.email,
    username: account.username,
    mustChangePassword: account.mustChangePassword,
    twoFactorOn: account.totpEnabledAt !== null,
  };
}
