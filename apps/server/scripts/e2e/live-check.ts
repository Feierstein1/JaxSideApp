/* eslint-disable @typescript-eslint/no-explicit-any -- loosely-typed JSON from live HTTP responses */
/**
 * Live end-to-end check against the running dev server (http://localhost:3000).
 * Plays several temporary people through the whole app over real HTTP: sign-up with
 * the emailed code, guests, posts, rooms, comments, votes, blocks, reports,
 * screening, spam, limits, account changes, the admin portal, strikes, appeals,
 * bans, deletion. Then removes everything it created.
 *
 *   npm run e2e:live -w @jax/server
 *
 * Only touches accounts whose usernames start with "zzt", and their content.
 * Needs: dev server running, docker services up, the dev database seeded.
 */
import { createHash } from 'node:crypto';
import { hashPassword } from '../../src/server/auth/crypto';
import { encryptedEmailFields } from '../../src/server/crypto/field-encryption';
import { uuidv7 } from '../../src/server/crypto/uuid';
import { db } from '../../src/server/db';
import sharp from 'sharp';
import { timeStep, totpAt } from '../../src/server/admin/totp';
import { objectStore } from '../../src/server/media/store';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const MAIL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const PW = 'zzt correct horse battery';
const HERE = { latitude: 30.3149, longitude: -81.6853 }; // downtown Jacksonville
const OUTSIDE = { latitude: 30.1661, longitude: -81.7065 }; // Orange Park (Clay County)
const RUN = Date.now().toString(36).slice(-5);
const startedAt = new Date();

// ───────────────────────────── tiny test harness ─────────────────────────────

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  results.push({ name, ok, detail: ok ? undefined : JSON.stringify(detail)?.slice(0, 300) });
  console.log(
    `${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `  → ${JSON.stringify(detail)?.slice(0, 300)}`}`,
  );
}
const section = (s: string) => console.log(`\n${s}`);

type Res = { status: number; body: any; headers: Headers };
async function http(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Res> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: 'manual',
  });
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}
const reading = (p = HERE) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 1_500 });

async function mailCode(to: string, subjectHint: RegExp): Promise<string | null> {
  for (let i = 0; i < 20; i++) {
    const list = await (
      await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)
    ).json();
    const msg = (list.messages ?? []).find((m: any) => subjectHint.test(m.Subject));
    if (msg) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json();
      const m = String(full.Text).match(/\b(\d{3}) ?(\d{3})\b/);
      if (m) return `${m[1]}${m[2]}`;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

// ───────────────────────────── people ─────────────────────────────

const createdUserIds: string[] = [];
const installTokens: string[] = [];

/** Fast path: a confirmed account straight in the database, then a real HTTP sign-in. */
async function person(name: string, opts: { createdDaysAgo?: number } = {}) {
  const id = uuidv7();
  const username = `zzt${RUN}_${name}`.slice(0, 20);
  await db.user.create({
    data: {
      id,
      username,
      usernameNormalized: username.toLowerCase(),
      ...encryptedEmailFields(id, `${username}@example.test`),
      passwordHash: await hashPassword(PW),
      emailVerifiedAt: new Date(),
      tosAcceptedAt: new Date(),
      tosVersion: 'e2e',
      adultConfirmedAt: new Date(),
      ageCutoffYear: 2008,
      createdAt: new Date(Date.now() - (opts.createdDaysAgo ?? 7) * 86_400_000),
    },
  });
  createdUserIds.push(id);
  const login = await http('POST', '/api/v1/auth/login', {
    body: { identifier: username, password: PW },
  });
  return { id, username, token: login.body.token as string, email: `${username}@example.test` };
}

// ───────────────────────────── the run ─────────────────────────────

async function run() {
  section('Server');
  const health = await http('GET', '/api/v1/health');
  check('health endpoint is up', health.status === 200, health);

  // ── Sign-up with the real email code (D31) ──
  section('Sign-up, email code, sign-in');
  const regName = `zzt${RUN}_reg`;
  const regEmail = `${regName}@example.test`;
  const reg = await http('POST', '/api/v1/auth/register', {
    body: {
      username: regName,
      email: regEmail,
      password: PW,
      birthYear: 1990,
      acceptTerms: true,
      confirmAdult: true,
    },
  });
  check('register accepted', reg.status === 202 || reg.status === 201, reg);
  const regUser = await db.user.findUnique({ where: { usernameNormalized: regName } });
  if (regUser) createdUserIds.push(regUser.id);
  const young = await http('POST', '/api/v1/auth/register', {
    body: {
      username: `zzt${RUN}_kid`,
      email: `zzt${RUN}_kid@example.test`,
      password: PW,
      birthYear: new Date().getFullYear() - 10,
      acceptTerms: true,
      confirmAdult: true,
    },
  });
  check('under-18 birth year is refused', young.status === 422, young.body);
  const login = await http('POST', '/api/v1/auth/login', {
    body: { identifier: regName, password: PW },
  });
  check('sign-in works before confirming email', login.status === 200, login.body);
  const regToken = login.body?.token as string;
  const bad = await http('POST', '/api/v1/auth/login', {
    body: { identifier: regName, password: 'wrong wrong wrong' },
  });
  check('wrong password refused (401)', bad.status === 401, bad.body);
  const unverifiedPost = await http('POST', '/api/v1/posts', {
    token: regToken,
    body: { reading: reading(), body: 'not yet confirmed' },
  });
  check(
    'posting before confirming email is refused',
    unverifiedPost.status === 403,
    unverifiedPost.body,
  );
  const code = await mailCode(regEmail, /confirm|verify|code/i);
  check('confirmation code arrives in Mailpit', !!code, code);
  const verify = await http('POST', '/api/v1/auth/verify-email/code', {
    token: regToken,
    body: { code },
  });
  check('email confirmed with the 6-digit code', verify.status === 200, verify.body);
  const me = await http('GET', '/api/v1/me', { token: regToken });
  check(
    '/me shows confirmed email, no password or birth year',
    me.body?.user?.emailVerified === true && !JSON.stringify(me.body).match(/password|birthYear/i),
    me.body,
  );

  // Password reset by code
  await http('POST', '/api/v1/auth/password-reset/request', { body: { email: regEmail } });
  const resetCode = await mailCode(regEmail, /reset|password/i);
  check('password reset code arrives', !!resetCode, resetCode);
  const NEWPW = 'zzt another good passphrase';
  const reset = await http('POST', '/api/v1/auth/password-reset/confirm-code', {
    body: { email: regEmail, code: resetCode, newPassword: NEWPW },
  });
  check('password reset with the code', reset.status === 200, reset.body);
  const oldSession = await http('GET', '/api/v1/me', { token: regToken });
  check('reset signs out existing sessions', oldSession.status === 401, oldSession.status);
  const relogin = await http('POST', '/api/v1/auth/login', {
    body: { identifier: regName, password: NEWPW },
  });
  check('sign-in with the new password', relogin.status === 200, relogin.body);

  // ── Location ──
  section('Location (Duval only)');
  const ann = await person('ann');
  const bob = await person('bob');
  const cat = await person('cat');
  const out = await person('out');
  const st = await http('POST', '/api/v1/location/status', {
    token: ann.token,
    body: { reading: reading() },
  });
  check('downtown is inside Duval', st.status === 200 && st.body?.eligible !== false, st.body);
  const outside = await http('POST', '/api/v1/feed', {
    token: out.token,
    body: { reading: reading(OUTSIDE) },
  });
  check('feed refused from Orange Park (outside Duval)', outside.status === 403, outside.body);
  const mocked = await http('POST', '/api/v1/feed', {
    token: out.token,
    body: { reading: { ...reading(), mocked: true } },
  });
  check('mock-location reading refused', mocked.status === 403, mocked.body);
  const stale = await http('POST', '/api/v1/feed', {
    token: ann.token,
    body: { reading: { ...HERE, accuracyMeters: 10, timestamp: Date.now() - 10 * 60_000 } },
  });
  check('10-minute-old reading refused', stale.status === 403 || stale.status === 400, stale.body);

  // ── Posts, feed, comments, votes ──
  section('Posts, feed, comments, votes');
  const p1 = await http('POST', '/api/v1/posts', {
    token: ann.token,
    body: { reading: reading(), body: `Live check ${RUN}: anyone at the Riverwalk tonight?` },
  });
  check('Ann posts to her area', p1.status === 201, p1.body);
  const postId = p1.body?.post?.id as string;
  check(
    'post response has no coordinates',
    !JSON.stringify(p1.body).match(/latitude|longitude/),
    p1.body,
  );
  const feed = await http('POST', '/api/v1/feed', {
    token: bob.token,
    body: { reading: reading() },
  });
  check(
    'Bob sees it in his feed',
    feed.body?.posts?.some((p: any) => p.id === postId),
    feed.body,
  );
  const burst = await http('POST', '/api/v1/posts', {
    token: ann.token,
    body: { reading: reading(), body: `Second post right away ${RUN}` },
  });
  check(
    'second post within 10 s is rate-limited with Retry-After',
    burst.status === 429 && !!burst.headers.get('retry-after'),
    { s: burst.status, b: burst.body },
  );
  const c1 = await http('POST', `/api/v1/posts/${postId}/comments`, {
    token: bob.token,
    body: { reading: reading(), body: 'I will be there around 7!' },
  });
  check('Bob comments', c1.status === 201, c1.body);
  const reply = await http('POST', `/api/v1/posts/${postId}/comments`, {
    token: cat.token,
    body: { reading: reading(), body: 'Same, see you there', parentCommentId: c1.body?.id },
  });
  check('Cat replies to Bob', reply.status === 201, reply.body);
  const up = await http('PUT', `/api/v1/posts/${postId}/vote`, {
    token: bob.token,
    body: { reading: reading(), value: 1 },
  });
  const down = await http('PUT', `/api/v1/posts/${postId}/vote`, {
    token: cat.token,
    body: { reading: reading(), value: -1 },
  });
  const again = await http('PUT', `/api/v1/posts/${postId}/vote`, {
    token: bob.token,
    body: { reading: reading(), value: 1 },
  });
  check(
    'votes: +1 and -1 give score 0; voting twice doesn’t double-count',
    up.body?.score === 1 && down.body?.score === 0 && again.body?.score === 0,
    [up.body, down.body, again.body],
  );
  const detail = await http('POST', `/api/v1/posts/${postId}`, {
    token: ann.token,
    body: { reading: reading() },
  });
  check(
    'post shows 2 comments, reply nested under Bob',
    detail.body?.comments?.length === 2 && detail.body.comments[1]?.depth === 1,
    detail.body,
  );
  const steal = await http('PATCH', `/api/v1/posts/${postId}`, {
    token: bob.token,
    body: { body: 'Bob edits Ann’s post' },
  });
  check('Bob can’t edit Ann’s post (404)', steal.status === 404, steal.body);
  const edit = await http('PATCH', `/api/v1/posts/${postId}`, {
    token: ann.token,
    body: { body: `Live check ${RUN}: Riverwalk tonight at 7?` },
  });
  check('Ann edits her post', edit.status === 200 && !!edit.body?.post?.editedAt, edit.body);
  const smuggle = await http('POST', '/api/v1/posts', {
    token: cat.token,
    body: { reading: reading(), body: 'hi', authorId: ann.id },
  });
  check('extra fields rejected (strict schema)', smuggle.status === 400, smuggle.body);

  // ── Photos (P6) ──
  section('Photos');
  const gpsJpeg = await sharp({
    create: { width: 1000, height: 750, channels: 3, background: '#136677' },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: 'ZztPhone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '30/1 18/1 5364/100' },
    })
    .toBuffer();
  const upRes = await fetch(`${BASE}/api/v1/photos`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cat.token}`, 'content-type': 'image/jpeg' },
    body: new Uint8Array(gpsJpeg),
  });
  const upBody: any = await upRes.json();
  check('Cat uploads a photo with GPS data in it', upRes.status === 201, upBody);
  const fake = await fetch(`${BASE}/api/v1/photos`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cat.token}`, 'content-type': 'image/jpeg' },
    body: '<svg onload="alert(1)"></svg>'.repeat(5),
  });
  check('a script pretending to be a JPEG is refused', fake.status === 422, fake.status);
  await new Promise((r) => setTimeout(r, 10_500)); // Cat's 10 s post burst window
  const photoPost = await http('POST', '/api/v1/posts', {
    token: cat.token,
    body: { reading: reading(), body: `Photo from the Riverwalk ${RUN}`, photoIds: [upBody.id] },
  });
  check(
    'Cat posts it',
    photoPost.status === 201 && photoPost.body?.post?.photos?.length === 1,
    photoPost.body,
  );
  const photoUrl = photoPost.body?.post?.photos?.[0]?.url as string;
  const img = await fetch(`${BASE}${photoUrl}`);
  const imgBytes = Buffer.from(await img.arrayBuffer());
  const imgMeta = await sharp(imgBytes)
    .metadata()
    .catch(() => null);
  check(
    'the served photo is a JPEG with no EXIF/GPS',
    img.status === 200 &&
      imgMeta?.format === 'jpeg' &&
      !imgMeta.exif &&
      !imgBytes.toString('latin1').includes('ZztPhone'),
    { s: img.status, exif: !!imgMeta?.exif },
  );
  const forged = await fetch(`${BASE}${photoUrl.replace(/sig=./, 'sig=Z')}`);
  check('a forged photo link is refused', forged.status === 403, forged.status);
  const stealPhoto = await http('POST', '/api/v1/posts', {
    token: bob.token,
    body: { reading: reading(), body: `stealing ${RUN}`, photoIds: [upBody.id] },
  });
  check('Bob can’t attach Cat’s photo', stealPhoto.status === 400, stealPhoto.body);

  // ── Places / business rooms ──
  section('Places and business rooms');
  const search = await http('POST', '/api/v1/places/search', {
    token: ann.token,
    body: { reading: reading(), limit: 20 },
  });
  check(
    'nearby places list',
    search.status === 200 && search.body?.places?.length > 0,
    search.body,
  );
  const place =
    search.body?.places?.find((p: any) => p.distanceMeters < 400) ?? search.body?.places?.[0];
  const atPlace = {
    latitude: place?.latitude ?? HERE.latitude,
    longitude: place?.longitude ?? HERE.longitude,
  };
  const placeId = place?.id as string;
  const before = await db.businessPlace.findUnique({ where: { id: placeId } });
  await new Promise((r) => setTimeout(r, 10_500)); // Cat's 10 s post burst window
  const roomPost = await http('POST', `/api/v1/places/${placeId}/posts`, {
    token: cat.token,
    body: { reading: reading(atPlace), body: `Great coffee here ${RUN}` },
  });
  check(`room post at ${place?.name ?? '?'}`, roomPost.status === 201, roomPost.body);
  const after = await db.businessPlace.findUnique({ where: { id: placeId } });
  check('place post count went up by 1', (after?.postCount ?? 0) === (before?.postCount ?? 0) + 1, [
    before?.postCount,
    after?.postCount,
  ]);
  const fav = await http('PUT', `/api/v1/places/${placeId}/favorite`, { token: cat.token });
  const favs = await http('GET', '/api/v1/me/favorites', { token: cat.token });
  check(
    'favorite a place',
    fav.status === 200 && favs.body?.favorites?.some((f: any) => f.id === placeId),
    favs.body,
  );
  await new Promise((r) => setTimeout(r, 10_500)); // Bob's 10 s post burst window
  const farRoom = await http('POST', `/api/v1/places/${placeId}/posts`, {
    token: bob.token,
    body: {
      reading: reading({ latitude: atPlace.latitude + 0.02, longitude: atPlace.longitude }),
      body: 'too far away',
    },
  });
  check('room post refused from ~1.4 mi away', farRoom.status === 403, farRoom.body);

  // ── Guests ──
  section('Guests (view-only)');
  const inst = await http('POST', '/api/v1/installations', { body: {} });
  installTokens.push(inst.body?.installationToken);
  const g = await http('POST', '/api/v1/guests', {
    body: {},
    headers: { 'X-Installation-Token': inst.body?.installationToken },
  });
  check(
    'guest session starts',
    g.status === 201 && !JSON.stringify(g.body).includes('"id"'),
    g.body,
  );
  const gt = g.body?.token as string;
  const gfeed = await http('POST', '/api/v1/feed', { token: gt, body: { reading: reading() } });
  check('guest reads the area feed', gfeed.status === 200, gfeed.body);
  for (const [label, r] of [
    [
      'comment',
      await http('POST', `/api/v1/posts/${postId}/comments`, {
        token: gt,
        body: { reading: reading(), body: 'guest comment' },
      }),
    ],
    [
      'vote',
      await http('PUT', `/api/v1/posts/${postId}/vote`, {
        token: gt,
        body: { reading: reading(), value: 1 },
      }),
    ],
    [
      'post',
      await http('POST', '/api/v1/posts', {
        token: gt,
        body: { reading: reading(), body: 'guest post' },
      }),
    ],
    [
      'report',
      await http('POST', '/api/v1/reports', {
        token: gt,
        body: { reading: reading(), target: { type: 'general', id: postId }, reason: 'SPAM' },
      }),
    ],
    [
      'open a business room',
      await http('POST', `/api/v1/places/${placeId}/posts/list`, {
        token: gt,
        body: { reading: reading(atPlace) },
      }),
    ],
  ] as const) {
    check(
      `guest can’t ${label} (403)`,
      r.status === 403 && r.body?.error?.code === 'GUEST_NOT_ALLOWED',
      r.body,
    );
  }

  // ── Profiles and blocking ──
  section('Profiles and blocking');
  const bio = await http('PATCH', '/api/v1/me/profile', {
    token: bob.token,
    body: { bio: 'Jax native, coffee fan.' },
  });
  check('Bob sets a bio', bio.status === 200, bio.body);
  const prof = await http('POST', `/api/v1/users/${bob.username}`, {
    token: ann.token,
    body: { reading: reading() },
  });
  check(
    'Ann views Bob’s profile (no email)',
    prof.status === 200 &&
      prof.body?.profile?.bio === 'Jax native, coffee fan.' &&
      !JSON.stringify(prof.body).includes('@example.test'),
    prof.body,
  );
  await http('PUT', `/api/v1/users/${bob.username}/block`, { token: ann.token });
  const blockedView = await http('POST', `/api/v1/posts/${postId}`, {
    token: ann.token,
    body: { reading: reading() },
  });
  check(
    'after blocking, Ann no longer sees Bob’s comment',
    !blockedView.body?.comments?.some((c: any) => c.body === 'I will be there around 7!'),
    blockedView.body?.comments,
  );
  const bobSeesAnn = await http('POST', `/api/v1/users/${ann.username}`, {
    token: bob.token,
    body: { reading: reading() },
  });
  check(
    'Bob can’t open Ann’s profile (blocked both ways)',
    bobSeesAnn.status === 404,
    bobSeesAnn.body,
  );
  await http('DELETE', `/api/v1/users/${bob.username}/block`, { token: ann.token });
  const unblocked = await http('POST', `/api/v1/posts/${postId}`, {
    token: ann.token,
    body: { reading: reading() },
  });
  check(
    'unblocking brings the comment back',
    unblocked.body?.comments?.some((c: any) => c.body === 'I will be there around 7!'),
    unblocked.body?.comments,
  );

  // ── Screening and spam ──
  section('Screening and spam');
  const held = await http('POST', `/api/v1/posts/${postId}/comments`, {
    token: cat.token,
    body: { reading: reading(), body: 'I know where you live' },
  });
  check(
    'threat phrase is held for review (202)',
    held.status === 202 && held.body?.held === true,
    held.body,
  );
  const heldVisible = await http('POST', `/api/v1/posts/${postId}`, {
    token: bob.token,
    body: { reading: reading() },
  });
  check(
    'held comment is not visible to others',
    !heldVisible.body?.comments?.some((c: any) => /know where you live/i.test(c.body ?? '')),
    heldVisible.body?.comments,
  );
  await new Promise((r) => setTimeout(r, 10_500)); // let the 10 s burst window pass for Ann
  const dupText = `Live check ${RUN}: Riverwalk tonight at 7?`;
  const dup = await http('POST', '/api/v1/posts', {
    token: ann.token,
    body: { reading: reading(), body: dupText },
  });
  check(
    'posting the same text again is refused',
    dup.status === 409 && dup.body?.error?.code === 'DUPLICATE_CONTENT',
    dup.body,
  );
  const linky = await http('POST', '/api/v1/posts', {
    token: bob.token,
    body: { reading: reading(), body: `deals ${RUN} a.example.com b.example.com c.example.com` },
  });
  check('3 links: held for review', linky.status === 202, linky.body);

  // ── Reports ──
  section('Reports');
  const rep = await http('POST', '/api/v1/reports', {
    token: bob.token,
    body: {
      reading: reading(),
      target: { type: 'comment', id: reply.body?.id },
      reason: 'HARASSMENT',
      details: 'rude',
    },
  });
  const rep2 = await http('POST', '/api/v1/reports', {
    token: bob.token,
    body: { reading: reading(), target: { type: 'comment', id: reply.body?.id }, reason: 'SPAM' },
  });
  check(
    'report accepted; repeat gives the same answer',
    rep.status === 202 && rep2.status === 202,
    [rep.body, rep2.body],
  );
  const own = await http('POST', '/api/v1/reports', {
    token: ann.token,
    body: { reading: reading(), target: { type: 'general', id: postId }, reason: 'SPAM' },
  });
  check('can’t report your own post', own.status === 400, own.body);
  const mine = await http('GET', '/api/v1/me/reports', { token: bob.token });
  check(
    'Bob sees one report, waiting',
    mine.body?.reports?.length === 1 && mine.body.reports[0].status === 'OPEN',
    mine.body,
  );

  // ── Account changes ──
  section('Account changes');
  const newName = `zzt${RUN}_bobby`.slice(0, 20);
  const rename = await http('PATCH', '/api/v1/me/username', {
    token: bob.token,
    body: { username: newName },
  });
  check('Bob changes his username', rename.status === 200, rename.body);
  const rename2 = await http('PATCH', '/api/v1/me/username', {
    token: bob.token,
    body: { username: `${newName.slice(0, 18)}x2` },
  });
  check('second change within 30 days refused', rename2.status === 409, rename2.body);
  const takeOld = await http('PATCH', '/api/v1/me/username', {
    token: cat.token,
    body: { username: bob.username },
  });
  check('Bob’s old name stays reserved', takeOld.status === 409, takeOld.body);
  bob.username = newName;
  const pw = await http('POST', '/api/v1/me/password', {
    token: cat.token,
    body: { currentPassword: PW, newPassword: 'zzt cat new passphrase' },
  });
  check('Cat changes her password', pw.status === 200, pw.body);
  const newCatEmail = `zzt${RUN}_cat2@example.test`;
  const em = await http('POST', '/api/v1/me/email', {
    token: cat.token,
    body: { newEmail: newCatEmail, password: 'zzt cat new passphrase' },
  });
  const emCode = await mailCode(newCatEmail, /code|confirm|email/i);
  const emOk = await http('POST', '/api/v1/me/email/confirm', {
    token: cat.token,
    body: { code: emCode },
  });
  const catMe = await http('GET', '/api/v1/me', { token: cat.token });
  check(
    'Cat changes her email with the code',
    em.status === 202 && emOk.status === 200 && catMe.body?.user?.email === newCatEmail,
    [em.body, emOk.body, catMe.body?.user?.email],
  );

  // ── Admin portal ──
  section('Admin portal');
  const boss = await person('boss');
  await db.user.update({ where: { id: boss.id }, data: { role: 'ADMIN' } });
  const a1 = await http('POST', '/api/v1/admin/login', {
    body: { identifier: boss.username, password: PW },
  });
  check(
    'admin step 1 gives a QR code for setup',
    a1.status === 200 && /^<svg/.test(a1.body?.enroll?.qrSvg ?? ''),
    a1.body?.error,
  );
  const notAdmin = await http('POST', '/api/v1/admin/login', {
    body: { identifier: ann.username, password: PW },
  });
  check('non-admin can’t sign in to the portal', notAdmin.status === 403, notAdmin.body);
  const a2 = await http('POST', '/api/v1/admin/login/verify', {
    body: {
      challenge: a1.body?.challenge,
      code: totpAt(a1.body?.enroll?.secret, timeStep(new Date())),
    },
  });
  const cookies = a2.headers.getSetCookie?.() ?? [];
  const cookieVal = (n: string) =>
    cookies
      .find((c) => c.startsWith(`${n}=`))
      ?.split(';')[0]
      ?.slice(n.length + 1) ?? '';
  const adminCookie = `jax_admin=${cookieVal('jax_admin')}`;
  const csrf = cookieVal('jax_admin_csrf');
  check('admin step 2 with the authenticator code', a2.status === 200 && !!csrf, a2.body);
  const adminH = { cookie: adminCookie, 'x-csrf-token': csrf };
  const bearerTry = await http('GET', '/api/v1/admin/summary', { token: boss.token });
  check('app token doesn’t open admin routes', bearerTry.status === 401, bearerTry.status);
  const page = await http('GET', '/admin/reports', { headers: { cookie: adminCookie } });
  check('reports page renders for the admin', page.status === 200, page.status);
  const anon = await http('GET', '/admin/reports');
  check(
    'reports page redirects without a session',
    anon.status === 307 || anon.status === 302,
    anon.status,
  );
  const cases = await http('GET', '/api/v1/admin/cases', { headers: adminH });
  const caseFor = (id: string) => cases.body?.cases?.find((c: any) => c.id === id);
  check(
    'queue has the held threat, the link post and Bob’s report',
    !!caseFor(
      held.body
        ? (await db.comment.findFirst({
            where: { body: 'I know where you live', authorUserId: cat.id },
          }))!.id
        : '',
    ) && !!caseFor(reply.body?.id),
    cases.body?.cases?.length,
  );
  const noCsrf = await http('POST', `/api/v1/admin/cases/comment/${reply.body?.id}`, {
    headers: { cookie: adminCookie },
    body: { decision: 'remove', reason: 'Harassment' },
  });
  check('admin change without CSRF token refused', noCsrf.status === 403, noCsrf.body);
  const decide = await http('POST', `/api/v1/admin/cases/comment/${reply.body?.id}`, {
    headers: adminH,
    body: { decision: 'remove', reason: 'Harassing reply', strike: true },
  });
  check(
    'admin removes Cat’s reply and gives a strike',
    decide.status === 200 && decide.body?.strike?.action === 'WARN',
    decide.body,
  );
  const bobReports = await http('GET', '/api/v1/me/reports', { token: bob.token });
  check(
    'Bob’s report now says action taken',
    bobReports.body?.reports?.[0]?.status === 'ACTIONED',
    bobReports.body,
  );
  const catStanding = await http('GET', '/api/v1/me/standing', { token: cat.token });
  check(
    'Cat sees her warning and can appeal',
    catStanding.body?.strikes?.[0]?.action === 'WARN' && catStanding.body.strikes[0].canAppeal,
    catStanding.body,
  );

  // Place suggestions (P5.8–P5.13)
  section('Place suggestions');
  const sugName = `Zzt ${RUN} Taqueria`;
  const sug = await http('POST', '/api/v1/submissions', {
    token: bob.token,
    body: { reading: reading(), name: sugName, category: 'restaurant', notes: 'Opened last week' },
  });
  check('Bob suggests a missing place from where he stands', sug.status === 201, sug.body);
  const hidden = await http('POST', '/api/v1/places/search', {
    token: bob.token,
    body: { reading: reading(), q: sugName },
  });
  check(
    'it is not searchable before approval',
    !hidden.body?.places?.some((p: any) => p.name === sugName),
    hidden.body?.places,
  );
  const dupCheck = await http('POST', '/api/v1/submissions/check', {
    token: cat.token,
    body: { reading: reading(atPlace), name: place?.name ?? 'x' },
  });
  check(
    'duplicate check finds the existing place',
    dupCheck.body?.places?.some((p: any) => p.id === placeId),
    dupCheck.body,
  );
  const sugReject = await http('POST', '/api/v1/submissions', {
    token: bob.token,
    body: { reading: reading(), name: `Zzt ${RUN} Ghost Shop`, category: 'shop' },
  });
  const queue = await http('GET', '/api/v1/admin/submissions', { headers: adminH });
  check(
    'both suggestions are in the admin queue',
    [sug.body?.id, sugReject.body?.id].every((id) =>
      queue.body?.submissions?.some((x: any) => x.id === id),
    ),
    queue.body?.submissions?.length,
  );
  const subPage = await http('GET', '/admin/submissions', { headers: { cookie: adminCookie } });
  check('suggestions page renders for the admin', subPage.status === 200, subPage.status);
  const [ap1, ap2] = await Promise.all([
    http('POST', `/api/v1/admin/submissions/${sug.body?.id}`, {
      headers: adminH,
      body: { decision: 'approve', category: 'fast_food' },
    }),
    http('POST', `/api/v1/admin/submissions/${sug.body?.id}`, {
      headers: adminH,
      body: { decision: 'approve', category: 'fast_food' },
    }),
  ]);
  check(
    'double approval: one succeeds, one is refused',
    [ap1.status, ap2.status].sort().join() === '200,409',
    [ap1.body, ap2.body],
  );
  const found = await http('POST', '/api/v1/places/search', {
    token: cat.token,
    body: { reading: reading(), q: sugName },
  });
  check(
    'approved place is now searchable, with the corrected category',
    found.body?.places?.some((p: any) => p.name === sugName && p.category === 'fast_food'),
    found.body?.places,
  );
  const badges = await db.userAchievement.count({ where: { userId: bob.id } });
  check('Bob got the Approved Contributor badge once', badges === 1, badges);
  await http('POST', `/api/v1/admin/submissions/${sugReject.body?.id}`, {
    headers: adminH,
    body: { decision: 'reject', reason: 'Couldn’t find it' },
  });
  const bobSugs = await http('GET', '/api/v1/me/submissions', { token: bob.token });
  check(
    'Bob sees one approved and one not approved, with the reason',
    bobSugs.body?.submissions?.some((x: any) => x.status === 'APPROVED') &&
      bobSugs.body?.submissions?.some((x: any) => x.decisionReason === 'Couldn’t find it'),
    bobSugs.body,
  );

  // Strike ladder → suspension → appeal → accepted
  section('Strikes, suspension, appeal');
  const s2 = await http('POST', `/api/v1/admin/users/${cat.id}/actions`, {
    headers: adminH,
    body: { action: 'strike', reason: 'Second harassing comment' },
  });
  check('second strike suspends for 24 h', s2.body?.result?.action === 'SUSPEND', s2.body);
  const suspended = await http('GET', '/api/v1/me', { token: cat.token });
  check(
    'Cat is blocked with the end time',
    suspended.status === 403 && /suspended until/.test(suspended.body?.error?.message ?? ''),
    suspended.body,
  );
  const restricted = await http('POST', '/api/v1/appeals/restricted/standing', {
    body: { identifier: cat.username, password: 'zzt cat new passphrase' },
  });
  check(
    'Cat sees why from the sign-in screen (password)',
    restricted.status === 200 && restricted.body?.status === 'SUSPENDED',
    restricted.body,
  );
  const suspension = restricted.body?.strikes?.find((s: any) => s.action === 'SUSPEND');
  const appeal = await http('POST', '/api/v1/appeals/restricted', {
    body: {
      identifier: cat.username,
      password: 'zzt cat new passphrase',
      actionId: suspension?.id,
      message: 'That second comment was a joke between friends.',
    },
  });
  check('Cat appeals the suspension', appeal.status === 201, appeal.body);
  const appeals = await http('GET', '/api/v1/admin/appeals', { headers: adminH });
  const ap = appeals.body?.appeals?.find((x: any) => x.user.id === cat.id);
  const accept = await http('POST', `/api/v1/admin/appeals/${ap?.id}`, {
    headers: adminH,
    body: { accept: true, note: 'Okay, context checks out.' },
  });
  check('admin accepts the appeal', accept.status === 200, accept.body);
  const back = await http('GET', '/api/v1/me', { token: cat.token });
  check('Cat can use the app again', back.status === 200, back.body);

  // Ban carries to the phone
  section('Ban');
  const banInst = await http('POST', '/api/v1/installations', { body: {} });
  installTokens.push(banInst.body?.installationToken);
  const outLogin = await http('POST', '/api/v1/auth/login', {
    body: { identifier: out.username, password: PW },
    headers: { 'X-Installation-Token': banInst.body?.installationToken },
  });
  const ban = await http('POST', `/api/v1/admin/users/${out.id}/actions`, {
    headers: adminH,
    body: { action: 'ban', reason: 'Spam account' },
  });
  check('admin bans a spam account', ban.status === 200 && outLogin.status === 200, ban.body);
  const outMe = await http('GET', '/api/v1/me', { token: outLogin.body?.token });
  check('banned account is signed out', outMe.status === 401, outMe.status);
  const phoneGuest = await http('POST', '/api/v1/guests', {
    body: {},
    headers: { 'X-Installation-Token': banInst.body?.installationToken },
  });
  check('banned phone can’t start guest mode', phoneGuest.status === 403, phoneGuest.body);
  const audit = await http('GET', '/api/v1/admin/audit', { headers: adminH });
  check(
    'audit log recorded the admin’s actions',
    (audit.body?.entries ?? []).filter((e: any) => e.admin === boss.username).length >= 5,
    audit.body?.entries?.length,
  );
  await http('POST', '/api/v1/admin/logout', { headers: adminH });
  const afterLogout = await http('GET', '/api/v1/admin/summary', { headers: adminH });
  check('admin sign-out ends the session', afterLogout.status === 401, afterLogout.status);

  // ── Account deletion ──
  section('Delete account');
  const del = await http('POST', '/api/v1/me/delete', {
    token: ann.token,
    body: { password: PW, confirm: 'DELETE' },
  });
  check('Ann deletes her account', del.status === 200, del.body);
  const annLogin = await http('POST', '/api/v1/auth/login', {
    body: { identifier: ann.username, password: PW },
  });
  check('deleted account can’t sign in', annLogin.status === 401, annLogin.body);
  const annPost = await http('POST', `/api/v1/posts/${postId}`, {
    token: bob.token,
    body: { reading: reading() },
  });
  check(
    'her post stays, shown as deleted user',
    annPost.status === 200 && annPost.body?.post?.author?.deleted === true,
    annPost.body?.post?.author,
  );
}

// ───────────────────────────── cleanup ─────────────────────────────

async function cleanup() {
  const users = await db.user.findMany({
    where: {
      OR: [{ id: { in: createdUserIds } }, { usernameNormalized: { startsWith: `zzt${RUN}` } }],
    },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const installs = await db.installation.findMany({
    where: {
      tokenHash: {
        in: installTokens.filter(Boolean).map((t) => createHash('sha256').update(t).digest('hex')),
      },
    },
    select: { id: true },
  });
  const installIds = installs.map((i) => i.id);
  // Room post counts back to where they were.
  const roomPosts = await db.businessPost.findMany({
    where: { authorId: { in: ids }, status: 'VISIBLE' },
    select: { placeId: true },
  });
  for (const r of roomPosts)
    await db.businessPlace.update({
      where: { id: r.placeId },
      data: { postCount: { decrement: 1 } },
    });
  const posts = (
    await db.generalPost.findMany({ where: { authorId: { in: ids } }, select: { id: true } })
  ).map((p) => p.id);
  const bposts = (
    await db.businessPost.findMany({ where: { authorId: { in: ids } }, select: { id: true } })
  ).map((p) => p.id);
  // Photos (rows and stored files).
  const photos = await db.photo.findMany({
    where: { uploaderId: { in: ids } },
    select: { id: true, storageKey: true },
  });
  for (const p of photos)
    if (p.storageKey)
      await objectStore()
        .delete(p.storageKey)
        .catch(() => undefined);
  await db.profile.updateMany({ where: { userId: { in: ids } }, data: { avatarPhotoId: null } });
  await db.appeal.deleteMany({ where: { userId: { in: ids } } });
  await db.report.deleteMany({
    where: {
      OR: [
        { reporterUserId: { in: ids } },
        { reportedUserId: { in: ids } },
        { generalPostId: { in: posts } },
        { businessPostId: { in: bposts } },
        { comment: { OR: [{ authorUserId: { in: ids } }, { generalPostId: { in: posts } }] } },
      ],
    },
  });
  await db.moderationAction.deleteMany({
    where: { OR: [{ adminId: { in: ids } }, { targetUserId: { in: ids } }] },
  });
  await db.adminAuditLog.deleteMany({ where: { adminId: { in: ids } } });
  await db.vote.deleteMany({ where: { voterId: { in: ids } } });
  // Replies first (children before parents).
  for (let i = 0; i < 5; i++) {
    await db.comment.deleteMany({
      where: {
        OR: [
          { authorUserId: { in: ids } },
          { generalPostId: { in: posts } },
          { businessPostId: { in: bposts } },
        ],
        replies: { none: {} },
      },
    });
  }
  await db.photo.deleteMany({ where: { uploaderId: { in: ids } } });
  await db.generalPost.deleteMany({ where: { id: { in: posts } } });
  await db.businessPost.deleteMany({ where: { id: { in: bposts } } });
  // Suggested places, and any places created by approving them.
  const subs = await db.businessSubmission.findMany({
    where: { submitterId: { in: ids } },
    select: { id: true },
  });
  await db.businessSubmission.deleteMany({ where: { submitterId: { in: ids } } });
  await db.businessPlace.deleteMany({
    where: { sourceName: 'community', sourceId: { in: subs.map((x) => x.id) } },
  });
  await db.accountDeletion.deleteMany({ where: { userId: { in: ids } } });
  await db.locationFlag.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { reviewedById: { in: ids } }] },
  });
  await db.locationCheck.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { installationId: { in: installIds } }] },
  });
  await db.guestSession.deleteMany({ where: { installationId: { in: installIds } } });
  await db.session.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { installationId: { in: installIds } }] },
  });
  await db.installation.deleteMany({ where: { id: { in: installIds } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  // Rate-limit counters made during the run, so your own testing isn't slowed down.
  await db.rateLimitCounter.deleteMany({
    where: {
      windowStart: { gte: new Date(startedAt.getTime() - 86_400_000) },
      OR: [
        ...ids.map((id) => ({ key: { contains: id } })),
        { key: { startsWith: 'login-fail:' } },
        { key: { startsWith: 'register:' } },
        { key: { startsWith: 'guest-session' } },
        { key: { startsWith: 'installation' } },
      ],
    },
  });
  // Test emails in Mailpit.
  const list = await (
    await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`zzt${RUN}`)}`)
  )
    .json()
    .catch(() => ({ messages: [] }));
  const mailIds = (list.messages ?? []).map((m: any) => m.ID);
  if (mailIds.length) {
    await fetch(`${MAIL}/api/v1/messages`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ IDs: mailIds }),
    });
  }
  console.log(
    `\nCleaned up ${ids.length} temporary accounts, ${installIds.length} installations, ${mailIds.length} emails.`,
  );
}

run()
  .catch((err) => {
    console.error('\nThe run stopped early:', err);
    results.push({ name: 'run completed', ok: false, detail: String(err) });
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
    await db.$disconnect();
    process.exit(failed.length ? 1 : 0);
  });
