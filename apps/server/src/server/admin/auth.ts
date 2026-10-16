import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import type { User } from '@/generated/prisma/client';
import { generateToken, hashToken } from '../auth/crypto';
import { checkCredentials, type RequestContext } from '../auth/service';
import { assertAccountUsable } from '../auth/standing';
import { getConfig } from '../config';
import { decryptField, encryptField, unwrapUserKey } from '../crypto/field-encryption';
import { db } from '../db';
import { getEnv } from '../env';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import { generateTotpSecret, matchTotp, otpauthUrl } from './totp';

/**
 * Admin portal sign-in (P5.11, D3, D4, D10, D60).
 *
 * 1. Username/email + password (same checks and failed-attempt limits as the app).
 *    The account must have the ADMIN role. The answer is a short-lived signed
 *    "challenge" that proves step 1 passed; on first sign-in it also carries a new
 *    authenticator secret to scan.
 * 2. The 6-digit authenticator code. Then an ADMIN session starts: an httpOnly,
 *    SameSite=Strict cookie plus a CSRF token, 8 h max and 30 min idle.
 *
 * Admin sessions only work on admin routes, and app (Bearer) sessions never work here.
 */

export const ADMIN_COOKIE = 'jax_admin';
export const CSRF_COOKIE = 'jax_admin_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const CHALLENGE_TTL_MS = 5 * 60_000;
const MINUTE_MS = 60_000;

/**
 * D62: the portal is for the owner's own computer for now. On a public server it's off
 * unless ADMIN_PORTAL_ENABLED=true; every admin page and route then answers 404, as if
 * it didn't exist. Defaults: on in development and tests, off in production.
 */
export function adminPortalEnabled(): boolean {
  const v = process.env.ADMIN_PORTAL_ENABLED;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return getEnv().NODE_ENV !== 'production';
}

export function assertAdminPortalEnabled() {
  if (!adminPortalEnabled()) throw new ApiError(404, 'NOT_FOUND', 'Not found');
}

// ───────────────────────────── Step 1 ─────────────────────────────

function sign(payload: string): string {
  return createHmac('sha256', getEnv().SESSION_SECRET)
    .update(`admin-challenge:${payload}`)
    .digest('base64url');
}

function makeChallenge(userId: string, now: Date): string {
  const payload = `${userId}.${now.getTime() + CHALLENGE_TTL_MS}.${randomBytes(8).toString('hex')}`;
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

const notAdmin = () => new ApiError(403, 'NOT_ADMIN', 'This account can’t use the admin portal.');

function userKey(user: User): Buffer {
  if (!user.dekWrapped)
    throw new ApiError(403, 'NOT_ADMIN', 'This account can’t use the admin portal.');
  return unwrapUserKey(user.id, user.dekWrapped);
}

/** Step 1. Returns the challenge, plus a new authenticator secret on first sign-in. */
export async function startAdminLogin(
  input: { identifier: string; password: string },
  ctx: RequestContext,
) {
  assertAdminPortalEnabled();
  const now = ctx.now ?? new Date();
  const user = await checkCredentials(input, ctx, { refuseBannedInstallation: false });
  assertAccountUsable(user, now);
  if (user.role !== 'ADMIN') throw notAdmin();
  const challenge = makeChallenge(user.id, now);
  if (user.totpEnabledAt) return { challenge, enroll: null };

  // First sign-in: a new secret, stored encrypted until the first code confirms it.
  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: user.id },
    data: {
      totpSecretEnc: Buffer.from(
        encryptField(user.id, 'totpSecret', userKey(user), secret),
      ).toString('base64'),
      totpLastStep: null,
    },
  });
  const url = otpauthUrl(secret, user.username);
  return {
    challenge,
    enroll: {
      secret,
      otpauthUrl: url,
      qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1 }),
    },
  };
}

// ───────────────────────────── Step 2 ─────────────────────────────

/** Step 2: the authenticator code. Returns the new session's token and CSRF token. */
export async function completeAdminLogin(
  input: { challenge: string; code: string },
  ctx: RequestContext,
) {
  assertAdminPortalEnabled();
  const now = ctx.now ?? new Date();
  const userId = readChallenge(input.challenge, now);
  await enforce(
    [
      {
        key: `admin-totp:user:${userId}`,
        limitKey: 'rateLimit.adminTotp.per15Min',
        windowSeconds: 900,
      },
    ],
    now,
  );
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'ADMIN') throw notAdmin();
  assertAccountUsable(user, now);
  if (!user.totpSecretEnc) throw new ApiError(401, 'CHALLENGE_EXPIRED', 'Please sign in again.');

  const secret = decryptField(
    user.id,
    'totpSecret',
    userKey(user),
    Buffer.from(user.totpSecretEnc, 'base64'),
  );
  const step = matchTotp(secret, input.code, now);
  // Replay protection: each 30-second code works once.
  if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) {
    throw new ApiError(401, 'INVALID_CODE', 'That code didn’t work. Check your authenticator app.');
  }
  const claimed = await db.user.updateMany({
    where: {
      id: user.id,
      OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
    },
    data: { totpLastStep: step, ...(user.totpEnabledAt ? {} : { totpEnabledAt: now }) },
  });
  if (claimed.count !== 1) {
    throw new ApiError(401, 'INVALID_CODE', 'That code didn’t work. Check your authenticator app.');
  }

  const hours = await getConfig('session.adminHours');
  const token = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(now.getTime() + hours * 3_600_000);
  await db.session.create({
    data: {
      userId: user.id,
      kind: 'ADMIN',
      tokenHash: hashToken(token),
      csrfTokenHash: hashToken(csrfToken),
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    },
  });
  await db.adminAuditLog.create({
    data: {
      adminId: user.id,
      action: user.totpEnabledAt ? 'ADMIN_SIGN_IN' : 'ADMIN_2FA_ENROLLED',
      targetType: 'user',
      targetId: user.id,
      createdAt: now,
    },
  });
  return { token, csrfToken, expiresAt };
}

// ───────────────────────────── Guard ─────────────────────────────

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name)
      return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const signedOut = () => new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to the admin portal.');

/**
 * The admin guard for /api/v1/admin/* and /admin pages. Checks the cookie session is
 * an ADMIN session, not expired or idle, for an active ADMIN with 2FA; for changes
 * (`mutation`), also the CSRF token. Bearer tokens are ignored.
 */
export async function adminFromToken(
  token: string | null,
  opts: { csrf?: string | null; mutation: boolean },
  now = new Date(),
) {
  assertAdminPortalEnabled();
  if (!token) throw signedOut();
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.kind !== 'ADMIN' || session.revokedAt || session.expiresAt <= now) {
    throw signedOut();
  }
  const idleMinutes = await getConfig('session.adminIdleMinutes');
  if (now.getTime() - session.lastUsedAt.getTime() > idleMinutes * MINUTE_MS) {
    await db.session.update({ where: { id: session.id }, data: { revokedAt: now } });
    throw signedOut();
  }
  const user = session.user;
  if (user.role !== 'ADMIN' || !user.totpEnabledAt) throw notAdmin();
  assertAccountUsable(user, now);
  if (opts.mutation) {
    const given = opts.csrf ? Buffer.from(hashToken(opts.csrf)) : null;
    const expected = Buffer.from(session.csrfTokenHash ?? '');
    if (!given || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ApiError(403, 'CSRF', 'Your session expired. Reload the page.');
    }
  }
  // Idle tracking: refresh at most once a minute.
  if (now.getTime() - session.lastUsedAt.getTime() > MINUTE_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: now } });
  }
  return { admin: user, session };
}

export function requireAdmin(req: Request, now = new Date()) {
  const mutation = !['GET', 'HEAD'].includes(req.method);
  return adminFromToken(
    readCookie(req, ADMIN_COOKIE),
    { csrf: req.headers.get(CSRF_HEADER), mutation },
    now,
  );
}

/** Cookie headers for a new admin session (and for clearing it). */
export function sessionCookies(token: string, csrfToken: string, expiresAt: Date): string[] {
  const secure = getEnv().NODE_ENV === 'production' ? '; Secure' : '';
  const exp = `; Expires=${expiresAt.toUTCString()}`;
  return [
    `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${secure}${exp}`,
    // Readable by the portal's own scripts, which echo it in the CSRF header.
    `${CSRF_COOKIE}=${csrfToken}; Path=/; SameSite=Strict${secure}${exp}`,
  ];
}

export function clearedCookies(): string[] {
  const gone = '; Path=/; SameSite=Strict; Max-Age=0';
  return [`${ADMIN_COOKIE}=${gone}; HttpOnly`, `${CSRF_COOKIE}=${gone}`];
}
