import { randomUUID } from 'node:crypto';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { generateToken, hashPassword, hashToken } from '@/server/crypto';
import { db } from '@/server/db';

export const PASSWORD = 'correct horse battery';
export const HOST = 'business.test';

/** Clears every business table and the site's rate-limit counters (not the app's data). */
export async function resetBusinessData() {
  await db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE key LIKE 'biz:%'`;
  await db.adDailyStats.deleteMany();
  await db.adReview.deleteMany();
  await db.ad.deleteMany();
  await db.adMedia.deleteMany();
  await db.subscription.deleteMany();
  await db.plan.deleteMany();
  await db.businessInvite.deleteMany();
  await db.businessPlaceAccess.deleteMany();
  await db.businessSession.deleteMany();
  await db.businessAccount.deleteMany();
  await removeTestPlaces();
}

export async function makeAccount(
  data: { email?: string; username?: string; mustChangePassword?: boolean } = {},
) {
  return db.businessAccount.create({
    data: {
      email: data.username ? null : (data.email ?? 'owner@example.com'),
      username: data.username ?? null,
      mustChangePassword: data.mustChangePassword ?? false,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
}

/** A place in the app's directory, for access and ad tests (location is raw SQL, like the app). */
export async function makePlace(name = 'Bold Bean', lat = 30.33, lng = -81.66) {
  const id = randomUUID();
  await db.$executeRaw`
    INSERT INTO "BusinessPlace"
      (id, name, "nameNormalized", category, latitude, longitude, location,
       "sourceName", "sourceId", "updatedAt")
    VALUES (${id}::uuid, ${name}, ${name.toLowerCase()}, 'cafe', ${lat}, ${lng},
       ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 'test', ${id}, now())`;
  return db.businessPlace.findUniqueOrThrow({ where: { id } });
}

/** Removes places and people made here (the app's tests own the rest of its data). */
export async function removeTestPlaces() {
  await db.businessPlace.deleteMany({ where: { sourceName: 'test' } }); // claims go with them
  await db.user.deleteMany({ where: { username: { startsWith: 'bt_' } } });
}

/**
 * A phone-app person with a verified owner claim, as the app server leaves them (D103).
 * A live user needs encrypted email fields only the app can make, so these are BANNED;
 * the business site never looks at the person, only at the claim.
 */
export async function makeOwnerClaim(
  placeId: string,
  opts: {
    username?: string;
    userId?: string;
    primary?: boolean;
    status?: 'VERIFIED' | 'REVOKED';
  } = {},
) {
  const userId =
    opts.userId ??
    (
      await db.user.create({
        data: {
          username: opts.username ?? `bt_${randomUUID().slice(0, 8)}`,
          usernameNormalized: (opts.username ?? `bt_${randomUUID().slice(0, 8)}`).toLowerCase(),
          passwordHash: 'x',
          ageCutoffYear: 2007,
          tosAcceptedAt: new Date(),
          tosVersion: 'test',
          adultConfirmedAt: new Date(),
          status: 'BANNED',
        },
      })
    ).id;
  return db.ownerClaim.create({
    data: {
      placeId,
      userId,
      method: 'EMAIL',
      status: opts.status ?? 'VERIFIED',
      primary: opts.primary ?? true,
      verifiedAt: new Date(),
    },
  });
}

/** An invite as the app server writes it (D172); returns the token from the email link. */
export async function makeInvite(
  claim: { id: string; placeId: string },
  expiresAt = new Date(Date.now() + 7 * 86_400_000),
) {
  const token = generateToken();
  await db.businessInvite.create({
    data: {
      tokenHash: hashToken(token),
      placeId: claim.placeId,
      ownerClaimId: claim.id,
      expiresAt,
    },
  });
  return token;
}

export function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://${HOST}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: HOST, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export type Browser = { session?: string; csrf?: string };

export function cookiesFrom(res: Response): Browser & { raw: string[] } {
  const raw = res.headers.getSetCookie();
  const value = (name: string) =>
    raw
      .find((c) => c.startsWith(`${name}=`))
      ?.split(';')[0]
      ?.slice(name.length + 1);
  return { session: value('jax_biz'), csrf: value('jax_biz_csrf'), raw };
}

/** Signs in through the route and returns what the browser would hold. */
export async function signIn(identifier = 'owner@example.com', password = PASSWORD) {
  const res = await loginRoute(post('/api/auth/login', { identifier, password }), {});
  return { res, ...cookiesFrom(res) };
}

/** A request from a signed-in browser: the cookies, plus the CSRF header on changes. */
export function authed(method: 'GET' | 'POST', path: string, s: Browser, body?: unknown) {
  return new Request(`http://${HOST}${path}`, {
    method,
    headers: {
      host: HOST,
      'content-type': 'application/json',
      cookie: `jax_biz=${s.session}; jax_biz_csrf=${s.csrf}`,
      ...(method === 'POST' && s.csrf ? { 'x-csrf-token': s.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
