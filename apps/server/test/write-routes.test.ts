/**
 * P3.7 / L5 / L6: every non-GET endpoint, checked against the required guard order:
 * auth guard → strict schema → rate limit → location → ownership.
 *
 * The table below must list every POST/PUT/PATCH/DELETE route in src/app/api. The first
 * test scans the folder and fails if a new write route was added without an entry here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as authLogin from '@/app/api/v1/auth/login/route';
import * as authLogout from '@/app/api/v1/auth/logout/route';
import * as resetCode from '@/app/api/v1/auth/password-reset/confirm-code/route';
import * as resetConfirm from '@/app/api/v1/auth/password-reset/confirm/route';
import * as resetRequest from '@/app/api/v1/auth/password-reset/request/route';
import * as authRegister from '@/app/api/v1/auth/register/route';
import * as authSessions from '@/app/api/v1/auth/sessions/route';
import * as verifyCode from '@/app/api/v1/auth/verify-email/code/route';
import * as verifyResend from '@/app/api/v1/auth/verify-email/resend/route';
import * as verifyLink from '@/app/api/v1/auth/verify-email/route';
import * as bizComments from '@/app/api/v1/business-posts/[id]/comments/route';
import * as bizPost from '@/app/api/v1/business-posts/[id]/route';
import * as bizVote from '@/app/api/v1/business-posts/[id]/vote/route';
import * as comment from '@/app/api/v1/comments/[id]/route';
import * as commentVote from '@/app/api/v1/comments/[id]/vote/route';
import * as feed from '@/app/api/v1/feed/route';
import * as installations from '@/app/api/v1/installations/route';
import * as locationStatus from '@/app/api/v1/location/status/route';
import * as prefs from '@/app/api/v1/me/preferences/route';
import * as favorite from '@/app/api/v1/places/[id]/favorite/route';
import * as roomList from '@/app/api/v1/places/[id]/posts/list/route';
import * as roomPosts from '@/app/api/v1/places/[id]/posts/route';
import * as place from '@/app/api/v1/places/[id]/route';
import * as search from '@/app/api/v1/places/search/route';
import * as postComments from '@/app/api/v1/posts/[id]/comments/route';
import * as postOne from '@/app/api/v1/posts/[id]/route';
import * as postVote from '@/app/api/v1/posts/[id]/vote/route';
import * as posts from '@/app/api/v1/posts/route';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { resetDb } from './db-helpers';
import { callRoute, type AnyHandler } from './route-call';
import { createTestUser } from './user-factory';

const IN = { latitude: 30.315, longitude: -81.686, accuracyMeters: 10 };
const OUT = { latitude: 30.1661, longitude: -81.7065, accuracyMeters: 10 }; // Orange Park
const r = (p: typeof IN) => ({ ...p, timestamp: Date.now() - 2_000 });

type Id = 'place' | 'post' | 'bizPost' | 'comment' | null;
interface Row {
  route: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  handler: AnyHandler;
  auth: boolean;
  id: Id;
  /** A valid body (built fresh per call so readings are always recent). */
  body?: (at: typeof IN) => Record<string, unknown>;
  /** True when the route checks the caller's location. */
  location: boolean;
}

const h = (m: Record<string, unknown>, k: string) => m[k] as AnyHandler;
const ROWS: Row[] = [
  // Public (no session)
  {
    route: 'auth/register',
    method: 'POST',
    handler: h(authRegister, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({
      username: 'someone',
      email: 's@example.test',
      password: 'correct horse battery',
      birthYear: 1990,
      acceptTerms: true,
      confirmAdult: true,
    }),
  },
  {
    route: 'auth/login',
    method: 'POST',
    handler: h(authLogin, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ identifier: 'x', password: 'y' }),
  },
  {
    route: 'auth/verify-email',
    method: 'POST',
    handler: h(verifyLink, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ token: 'x'.repeat(43) }),
  },
  {
    route: 'auth/password-reset/request',
    method: 'POST',
    handler: h(resetRequest, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ email: 'a@example.test' }),
  },
  {
    route: 'auth/password-reset/confirm',
    method: 'POST',
    handler: h(resetConfirm, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ token: 'x'.repeat(43), newPassword: 'correct horse battery' }),
  },
  {
    route: 'auth/password-reset/confirm-code',
    method: 'POST',
    handler: h(resetCode, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ email: 'a@example.test', code: '123456', newPassword: 'correct horse battery' }),
  },
  {
    route: 'installations',
    method: 'POST',
    handler: h(installations, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({}),
  },
  // Account
  {
    route: 'auth/logout',
    method: 'POST',
    handler: h(authLogout, 'POST'),
    auth: true,
    id: null,
    location: false,
  },
  {
    route: 'auth/sessions',
    method: 'DELETE',
    handler: h(authSessions, 'DELETE'),
    auth: true,
    id: null,
    location: false,
  },
  {
    route: 'auth/verify-email/resend',
    method: 'POST',
    handler: h(verifyResend, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({}),
  },
  {
    route: 'auth/verify-email/code',
    method: 'POST',
    handler: h(verifyCode, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ code: '123456' }),
  },
  {
    route: 'me/preferences',
    method: 'PATCH',
    handler: h(prefs, 'PATCH'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ generalRadiusMiles: 0.5 }),
  },
  {
    route: 'places/[id]/favorite',
    method: 'PUT',
    handler: h(favorite, 'PUT'),
    auth: true,
    id: 'place',
    location: false,
    body: () => ({}),
  },
  {
    route: 'places/[id]/favorite',
    method: 'DELETE',
    handler: h(favorite, 'DELETE'),
    auth: true,
    id: 'place',
    location: false,
    body: () => ({}),
  },
  // Location-bound reads (POST because they carry a reading)
  {
    route: 'location/status',
    method: 'POST',
    handler: h(locationStatus, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'places/search',
    method: 'POST',
    handler: h(search, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'places/[id]',
    method: 'POST',
    handler: h(place, 'POST'),
    auth: true,
    id: 'place',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'feed',
    method: 'POST',
    handler: h(feed, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'places/[id]/posts/list',
    method: 'POST',
    handler: h(roomList, 'POST'),
    auth: true,
    id: 'place',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'posts/[id]',
    method: 'POST',
    handler: h(postOne, 'POST'),
    auth: true,
    id: 'post',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'business-posts/[id]',
    method: 'POST',
    handler: h(bizPost, 'POST'),
    auth: true,
    id: 'bizPost',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  // Location-bound writes
  {
    route: 'posts',
    method: 'POST',
    handler: h(posts, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at), body: 'x' }),
  },
  {
    route: 'places/[id]/posts',
    method: 'POST',
    handler: h(roomPosts, 'POST'),
    auth: true,
    id: 'place',
    location: true,
    body: (at) => ({ reading: r(at), body: 'x' }),
  },
  {
    route: 'posts/[id]/comments',
    method: 'POST',
    handler: h(postComments, 'POST'),
    auth: true,
    id: 'post',
    location: true,
    body: (at) => ({ reading: r(at), body: 'x' }),
  },
  {
    route: 'business-posts/[id]/comments',
    method: 'POST',
    handler: h(bizComments, 'POST'),
    auth: true,
    id: 'bizPost',
    location: true,
    body: (at) => ({ reading: r(at), body: 'x' }),
  },
  {
    route: 'posts/[id]/vote',
    method: 'PUT',
    handler: h(postVote, 'PUT'),
    auth: true,
    id: 'post',
    location: true,
    body: (at) => ({ reading: r(at), value: 1 }),
  },
  {
    route: 'business-posts/[id]/vote',
    method: 'PUT',
    handler: h(bizVote, 'PUT'),
    auth: true,
    id: 'bizPost',
    location: true,
    body: (at) => ({ reading: r(at), value: 1 }),
  },
  {
    route: 'comments/[id]/vote',
    method: 'PUT',
    handler: h(commentVote, 'PUT'),
    auth: true,
    id: 'comment',
    location: true,
    body: (at) => ({ reading: r(at), value: 1 }),
  },
  // Owner-only edits/deletes (no location: content is already placed)
  {
    route: 'posts/[id]',
    method: 'PATCH',
    handler: h(postOne, 'PATCH'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({ body: 'edited' }),
  },
  {
    route: 'posts/[id]',
    method: 'DELETE',
    handler: h(postOne, 'DELETE'),
    auth: true,
    id: 'post',
    location: false,
  },
  {
    route: 'business-posts/[id]',
    method: 'PATCH',
    handler: h(bizPost, 'PATCH'),
    auth: true,
    id: 'bizPost',
    location: false,
    body: () => ({ body: 'edited' }),
  },
  {
    route: 'business-posts/[id]',
    method: 'DELETE',
    handler: h(bizPost, 'DELETE'),
    auth: true,
    id: 'bizPost',
    location: false,
  },
  {
    route: 'comments/[id]',
    method: 'PATCH',
    handler: h(comment, 'PATCH'),
    auth: true,
    id: 'comment',
    location: false,
    body: () => ({ body: 'edited' }),
  },
  {
    route: 'comments/[id]',
    method: 'DELETE',
    handler: h(comment, 'DELETE'),
    auth: true,
    id: 'comment',
    location: false,
  },
];

let owner: string; // created the fixtures
let other: string; // a second verified user
const ids: Record<Exclude<Id, null>, string> = { place: '', post: '', bizPost: '', comment: '' };

beforeAll(async () => {
  await resetDb();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Fixture Cafe' },
    },
  ]);
  ids.place = (await db.businessPlace.findFirstOrThrow()).id;
  const o = await createTestUser('owner_w', { emailVerifiedAt: new Date() });
  owner = (await createSession(o.id, 'MOBILE')).token;
  other = (
    await createSession(
      (await createTestUser('other_w', { emailVerifiedAt: new Date() })).id,
      'MOBILE',
    )
  ).token;
  ids.post = (
    await callRoute(h(posts, 'POST'), 'POST', { token: owner, body: { reading: r(IN), body: 'p' } })
  ).body.post.id;
  ids.bizPost = (
    await callRoute(h(roomPosts, 'POST'), 'POST', {
      token: owner,
      id: ids.place,
      body: { reading: r(IN), body: 'b' },
    })
  ).body.post.id;
  ids.comment = (
    await callRoute(h(postComments, 'POST'), 'POST', {
      token: owner,
      id: ids.post,
      body: { reading: r(IN), body: 'c' },
    })
  ).body.id;
  // Lift limits so the table can hit each route several times; limits have their own tests.
  await db.appConfiguration.createMany({
    data: [
      'rateLimit.post.perMinute',
      'rateLimit.post.perDay',
      'rateLimit.comment.perMinute',
      'rateLimit.register.perHourPerIp',
      'rateLimit.installation.perHourPerIp',
      'rateLimit.passwordReset.perHourPerIp',
      'rateLimit.codeAttempt.per15MinPerIp',
      'rateLimit.login.per15MinPerIp',
      'rateLimit.login.per15MinPerAccount',
      'rateLimit.verifyEmailResend.perHour',
    ].map((key) => ({ key, value: 1000 })),
  });
});

const call = (row: Row, opts: { token?: string; body?: unknown }) =>
  callRoute(row.handler, row.method, { ...opts, id: row.id ? ids[row.id] : undefined });
const label = (row: Row) => `${row.method} /${row.route}`;

describe('write route table (P3.7)', () => {
  it('lists every POST/PUT/PATCH/DELETE route in src/app/api', () => {
    const root = path.resolve(import.meta.dirname, '../src/app/api/v1');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === 'route.ts') {
          const rel = path.relative(root, dir).split(path.sep).join('/');
          for (const m of readFileSync(p, 'utf8').matchAll(
            /export const (POST|PUT|PATCH|DELETE)\b/g,
          )) {
            found.push(`${m[1]} /${rel}`);
          }
        }
      }
    };
    walk(root);
    expect(found.sort()).toEqual(ROWS.map(label).sort());
  });

  // 🔒 Auth guard first: no session, no access (and no hint about the resource).
  it.each(ROWS.filter((x) => x.auth).map((x) => [label(x), x] as const))(
    '%s → 401 without a session',
    async (_l, row) => {
      const res = await call(row, { body: row.body?.(IN) });
      expect(res.status).toBe(401);
    },
  );

  // 🔒 Strict schemas: fields that would change identity, roles or totals are refused (L5).
  it.each(ROWS.filter((x) => x.body).map((x) => [label(x), x] as const))(
    '%s → 400 for an unexpected field',
    async (_l, row) => {
      const res = await call(row, {
        token: row.auth ? owner : undefined,
        body: { ...row.body!(IN), role: 'ADMIN', userId: 'someone-else' },
      });
      expect(res.status).toBe(400);
    },
  );

  // 🔒 Location: an outside-Duval reading never gets through (L5, L6).
  it.each(ROWS.filter((x) => x.location).map((x) => [label(x), x] as const))(
    '%s → 403 from outside Duval',
    async (_l, row) => {
      const res = await call(row, { token: other, body: row.body!(OUT) });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('LOCATION_OUTSIDE_AREA');
    },
  );

  // 🔒 Ownership: another user can't edit or delete (404, no IDOR hint).
  it.each(
    ROWS.filter(
      (x) => (x.method === 'PATCH' || x.method === 'DELETE') && x.id && x.id !== 'place',
    ).map((x) => [label(x), x] as const),
  )('%s → 404 for someone else’s content', async (_l, row) => {
    const res = await call(row, { token: other, body: row.body?.(IN) });
    expect(res.status).toBe(404);
  });
});
