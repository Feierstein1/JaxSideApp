/**
 * Every change (POST/PUT/PATCH/DELETE) on the business website, checked against the
 * required guard order (CLAUDE.md): auth guard → strict schema → rate limit → ownership.
 *
 * The table must list every write route in src/app/api. The first test scans the folder
 * and fails if a new write route was added without an entry here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as login from '@/app/api/auth/login/route';
import * as commentDelete from '@/app/api/places/[placeId]/comments/[commentId]/delete/route';
import * as postDelete from '@/app/api/places/[placeId]/posts/[postId]/delete/route';
import * as replies from '@/app/api/places/[placeId]/posts/[postId]/replies/route';
import * as posts from '@/app/api/places/[placeId]/posts/route';
import * as teamMember from '@/app/api/places/[placeId]/team/[accountId]/route';
import * as team from '@/app/api/places/[placeId]/team/route';
import * as inviteAccept from '@/app/api/invites/accept/route';
import * as inviteAcceptNew from '@/app/api/invites/accept-new/route';
import * as logout from '@/app/api/auth/logout/route';
import * as password from '@/app/api/auth/password/route';
import * as twoFactorConfirm from '@/app/api/auth/two-factor/confirm/route';
import * as twoFactorDisable from '@/app/api/auth/two-factor/disable/route';
import * as twoFactorLogin from '@/app/api/auth/two-factor/login/route';
import * as twoFactorSetup from '@/app/api/auth/two-factor/setup/route';
import {
  HOST,
  authed,
  makeAccount,
  post,
  resetBusinessData,
  signIn,
  type Browser,
} from './helpers';

// `never`: each route declares its own params; the table only needs to call them.
type Handler = (req: Request, ctx: never) => Promise<Response>;
type Entry = {
  path: string;
  method: 'POST';
  handler: Handler;
  /** public = before sign-in (same-site check + schema); session = signed-in + CSRF. */
  kind: 'public' | 'session';
  /** Takes a JSON body, so a bad one must be refused with 400 after the guards pass. */
  body: boolean;
};

const ROUTES: Entry[] = [
  {
    path: 'places/[placeId]/posts',
    method: 'POST',
    handler: posts.POST,
    kind: 'session',
    body: true,
  },
  {
    path: 'places/[placeId]/posts/[postId]/replies',
    method: 'POST',
    handler: replies.POST,
    kind: 'session',
    body: true,
  },
  {
    path: 'places/[placeId]/posts/[postId]/delete',
    method: 'POST',
    handler: postDelete.POST,
    kind: 'session',
    body: true,
  },
  {
    path: 'places/[placeId]/comments/[commentId]/delete',
    method: 'POST',
    handler: commentDelete.POST,
    kind: 'session',
    body: true,
  },
  {
    path: 'places/[placeId]/team',
    method: 'POST',
    handler: team.POST,
    kind: 'session',
    body: true,
  },
  {
    path: 'places/[placeId]/team/[accountId]',
    method: 'POST',
    handler: teamMember.POST,
    kind: 'session',
    body: true,
  },
  {
    path: 'invites/accept-new',
    method: 'POST',
    handler: inviteAcceptNew.POST,
    kind: 'public',
    body: true,
  },
  {
    path: 'invites/accept',
    method: 'POST',
    handler: inviteAccept.POST,
    kind: 'session',
    body: true,
  },
  { path: 'auth/login', method: 'POST', handler: login.POST, kind: 'public', body: true },
  {
    path: 'auth/two-factor/login',
    method: 'POST',
    handler: twoFactorLogin.POST,
    kind: 'public',
    body: true,
  },
  { path: 'auth/logout', method: 'POST', handler: logout.POST, kind: 'session', body: false },
  { path: 'auth/password', method: 'POST', handler: password.POST, kind: 'session', body: true },
  {
    path: 'auth/two-factor/setup',
    method: 'POST',
    handler: twoFactorSetup.POST,
    kind: 'session',
    body: false,
  },
  {
    path: 'auth/two-factor/confirm',
    method: 'POST',
    handler: twoFactorConfirm.POST,
    kind: 'session',
    body: true,
  },
  {
    path: 'auth/two-factor/disable',
    method: 'POST',
    handler: twoFactorDisable.POST,
    kind: 'session',
    body: true,
  },
];

/** Route params for dynamic routes (made-up ids; the guards answer before they're used). */
const ZERO = '00000000-0000-7000-8000-000000000000';
const PARAMS = {
  params: Promise.resolve({ placeId: ZERO, accountId: ZERO, postId: ZERO, commentId: ZERO }),
} as never;

const API_DIR = path.resolve(import.meta.dirname, '../src/app/api');

function writeRoutesOnDisk(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'route.ts') {
        const src = readFileSync(full, 'utf8');
        const rel = path.relative(API_DIR, dir).split(path.sep).join('/');
        for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
          if (new RegExp(`export const ${m}\\b`).test(src)) found.push(`${m} ${rel}`);
        }
      }
    }
  };
  walk(API_DIR);
  return found.sort();
}

describe('business write routes', () => {
  it('lists every write route', () => {
    expect(ROUTES.map((r) => `${r.method} ${r.path}`).sort()).toEqual(writeRoutesOnDisk());
  });

  let s: Browser;
  beforeAll(async () => {
    await resetBusinessData();
    await makeAccount();
    s = await signIn();
  });

  const req = (e: Entry, headers: Record<string, string>, body: unknown = {}) =>
    new Request(`http://${HOST}/api/${e.path}`, {
      method: e.method,
      headers: { host: HOST, 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  for (const e of ROUTES.filter((r) => r.kind === 'session')) {
    describe(`${e.method} ${e.path}`, () => {
      it('refuses a request with no session (401)', async () => {
        expect((await e.handler(req(e, {}), PARAMS)).status).toBe(401);
      });

      it('refuses a signed-in request without the CSRF token (403)', async () => {
        const res = await e.handler(req(e, { cookie: `jax_biz=${s.session}` }), PARAMS);
        expect(res.status).toBe(403);
      });

      it('refuses a signed-in request from another site (403)', async () => {
        const res = await e.handler(
          req(e, {
            cookie: `jax_biz=${s.session}; jax_biz_csrf=${s.csrf}`,
            'x-csrf-token': s.csrf!,
            origin: 'https://evil.example',
          }),
          PARAMS,
        );
        expect(res.status).toBe(403);
      });

      if (e.body) {
        it('refuses unknown fields once signed in (400)', async () => {
          const res = await e.handler(
            authed('POST', `/api/${e.path}`, s, { unexpected: true }),
            PARAMS,
          );
          expect(res.status).toBe(400);
        });
      }
    });
  }

  for (const e of ROUTES.filter((r) => r.kind === 'public')) {
    describe(`${e.method} ${e.path}`, () => {
      it('refuses a request from another site (403)', async () => {
        expect((await e.handler(req(e, { origin: 'https://evil.example' }), PARAMS)).status).toBe(
          403,
        );
      });

      it('refuses unknown fields (400)', async () => {
        expect((await e.handler(post(`/api/${e.path}`, { unexpected: true }), PARAMS)).status).toBe(
          400,
        );
      });
    });
  }
});
