import { timingSafeEqual } from 'node:crypto';
import type { BusinessAccount, BusinessSession } from '@/generated/prisma/client';
import { burnPasswordCheck, generateToken, hashToken, verifyPassword } from './crypto';
import { db } from './db';
import { getEnv } from './env';
import { ApiError } from './http';

/**
 * Business website sign-in (D169, B1.2). A session is an httpOnly, SameSite=Strict cookie
 * plus a CSRF token the pages echo in a header. Sessions live in their own table, so a
 * token from the phone app is never a valid business session, and the other way round.
 */

export const SESSION_COOKIE = 'jax_biz';
export const CSRF_COOKIE = 'jax_biz_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export const SESSION_HOURS = 12;
export const IDLE_MINUTES = 60;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const MINUTE_MS = 60_000;

const badLogin = () => new ApiError(401, 'INVALID_LOGIN', 'That email or password is not right.');
const signedOut = () => new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');

export async function login(input: { email: string; password: string }, now = new Date()) {
  const account = await db.businessAccount.findUnique({ where: { email: input.email } });
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
  const token = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * MINUTE_MS);
  await db.businessSession.create({
    data: {
      accountId: account.id,
      tokenHash: hashToken(token),
      csrfTokenHash: hashToken(csrfToken),
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    },
  });
  return { token, csrfToken, expiresAt, account };
}

export async function logout(session: BusinessSession) {
  await db.businessSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
}

/**
 * The guard for every signed-in page and route. Checks the cookie session is live (not
 * expired, idle or revoked) for an account that isn't revoked; for changes (`mutation`),
 * also the CSRF token.
 */
export async function accountFromToken(
  token: string | null,
  opts: { csrf?: string | null; mutation: boolean },
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

  if (opts.mutation) {
    const given = opts.csrf ? Buffer.from(hashToken(opts.csrf)) : null;
    const expected = Buffer.from(session.csrfTokenHash);
    if (!given || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ApiError(403, 'CSRF', 'Your session expired. Reload the page.');
    }
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

/** The business guard for /api routes. Cookies only; Bearer tokens are ignored. */
export function requireBusiness(req: Request, now = new Date()) {
  const mutation = !['GET', 'HEAD'].includes(req.method);
  if (mutation) assertSameOrigin(req);
  return accountFromToken(
    readCookie(req, SESSION_COOKIE),
    { csrf: req.headers.get(CSRF_HEADER), mutation },
    now,
  );
}

export function sessionCookies(token: string, csrfToken: string, expiresAt: Date): string[] {
  const secure = getEnv().NODE_ENV === 'production' ? '; Secure' : '';
  const exp = `; Expires=${expiresAt.toUTCString()}`;
  return [
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${secure}${exp}`,
    // Readable by the site's own scripts, which echo it in the CSRF header.
    `${CSRF_COOKIE}=${csrfToken}; Path=/; SameSite=Strict${secure}${exp}`,
  ];
}

export function clearedCookies(): string[] {
  const gone = '; Path=/; SameSite=Strict; Max-Age=0';
  return [`${SESSION_COOKIE}=${gone}; HttpOnly`, `${CSRF_COOKIE}=${gone}`];
}
