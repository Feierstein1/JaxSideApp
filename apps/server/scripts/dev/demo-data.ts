/**
 * Dev only: demo people, posts, photos, comments, votes and a friend request, placed where
 * a real account has posted, so the app can be tried with a lively feed.
 *
 *   npm run demo:data -w @jax/server -- [--near <username>]   (default TestAdmin)
 *   npm run demo:data -w @jax/server -- --remove                (deletes every demo_ account)
 *   npm run demo:data -w @jax/server -- --changes [--near <username>]
 *     (D94: demo place changes to vote on near that account's area posts)
 *
 * Accounts are named demo_*, confirmed, and share one password (printed at the end). Photos
 * and a GIF are drawn here and go through the real upload pipeline (checked, re-encoded,
 * stored privately). Refuses to run in production.
 */
import sharp from 'sharp';
import { normalizeUsername, profileColor } from '@jax/shared';
import { hashPassword } from '../../src/server/auth/crypto';
import { encryptedEmailFields } from '../../src/server/crypto/field-encryption';
import { uuidv7 } from '../../src/server/crypto/uuid';
import { db } from '../../src/server/db';
import { createComment } from '../../src/server/discussions/comments';
import { createBusinessPost, createGeneralPost } from '../../src/server/discussions/posts';
import { castVote } from '../../src/server/discussions/votes';
import { castPlaceVote, requestRemoval } from '../../src/server/directory/place-changes';
import { createSubmission } from '../../src/server/directory/submissions';
import { uploadPhoto } from '../../src/server/media/photos';
import { sendFriendRequest } from '../../src/server/social/friends';

const PASSWORD = 'JaxDemo-2026!';
const args = process.argv.slice(2);
const near = args.includes('--near') ? args[args.indexOf('--near') + 1]! : 'TestAdmin';

const PEOPLE = [
  { username: 'demo_maya', color: 'coral', bio: 'Riverside born and raised. Coffee first.' },
  { username: 'demo_jordan', color: 'navy', bio: 'Bikes, dogs and Five Points tacos.' },
  { username: 'demo_luis', color: 'forest', bio: 'Avondale porch sitter. Ask me about plants.' },
  { username: 'demo_priya', color: 'violet', bio: 'New to Jax! Finding the best spots.' },
  { username: 'demo_sam', color: 'gold', bio: 'Night owl. Live music whenever possible.' },
] as const;

const AREA_POSTS = [
  'Anyone else hear the parade practicing down the street? 🥁',
  'Lost a gray cat with a red collar near here. Answers to Biscuit. Please DM!',
  'Free mulch pile on the corner, help yourself before the rain.',
  'The sunset tonight was unreal. Look at this ↓',
  'Is the farmers market still on this Saturday?',
  'Shoutout to whoever left the little free library stocked. Grabbed a great mystery novel.',
  'Power flickered twice in the last hour. Anyone else?',
  'Morning walk crew, we meet at 7 by the oak tree if anyone wants to join.',
];
const PLACE_POSTS = [
  'Went here last night, service was quick and friendly.',
  'Happy hour is the move. Get the wings.',
  'Way busier than usual today, expect a wait.',
  'They just added new stuff, worth checking out!',
  'Parking is rough on weekends. Bike if you can.',
];
const COMMENTS = [
  'Totally agree!',
  'Thanks for the heads up 🙏',
  'Saw the same thing earlier.',
  'Ha, classic Riverside.',
  'Will check it out this weekend.',
  'Same here, came back on after a minute.',
];

// ───────────── Images drawn in code (no stock photos needed) ─────────────

const SCENES = [
  { sky: ['#ff7e5f', '#feb47b'], ground: '#2d4a3e', label: 'Golden hour' },
  { sky: ['#4facfe', '#00f2fe'], ground: '#3b6e3b', label: 'Blue sky day' },
  { sky: ['#43cea2', '#185a9d'], ground: '#1f3b2c', label: 'By the river' },
  { sky: ['#f093fb', '#f5576c'], ground: '#402040', label: 'Pink sunset' },
  { sky: ['#30cfd0', '#330867'], ground: '#111827', label: 'Night out' },
];

function sceneSvg(i: number, w: number, h: number) {
  const s = SCENES[i % SCENES.length]!;
  const sunX = w * (0.25 + (i % 3) * 0.25);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${s.sky[0]}"/><stop offset="1" stop-color="${s.sky[1]}"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${sunX}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.12}" fill="#fff6c2" opacity="0.9"/>
    <path d="M0 ${h * 0.7} Q ${w * 0.3} ${h * 0.6} ${w * 0.55} ${h * 0.72} T ${w} ${h * 0.66} V ${h} H 0 Z" fill="${s.ground}"/>
    <rect x="${w * 0.08}" y="${h * 0.48}" width="${w * 0.05}" height="${h * 0.24}" fill="#3e2a1e"/>
    <circle cx="${w * 0.105}" cy="${h * 0.46}" r="${w * 0.07}" fill="#2f5d3a"/>
    <text x="${w / 2}" y="${h * 0.9}" font-family="Arial, sans-serif" font-size="${Math.round(h * 0.06)}"
      font-weight="700" fill="#ffffff" text-anchor="middle">${s.label}</text>
  </svg>`;
}

const SIZES: [number, number][] = [
  [1600, 1200], // landscape
  [1080, 1350], // portrait
  [1200, 1200], // square
  [1920, 1080], // wide
];

async function photo(i: number) {
  const [w, h] = SIZES[i % SIZES.length]!;
  return sharp(Buffer.from(sceneSvg(i, w, h)))
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function gif() {
  const frames = await Promise.all(
    Array.from({ length: 12 }, (_, f) => {
      const x = 60 + Math.round(Math.sin((f / 12) * Math.PI * 2) * 140) + 180;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">
        <rect width="480" height="320" fill="#101820"/>
        <circle cx="${x}" cy="160" r="46" fill="#D7A22A"/>
        <text x="240" y="290" font-family="Arial" font-size="28" font-weight="700" fill="#fff"
          text-anchor="middle">Jax GIF test</text></svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }),
  );
  return sharp(frames, { join: { animated: true } })
    .gif({ delay: 90 })
    .toBuffer();
}

async function avatar(name: string, hex: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <rect width="512" height="512" fill="${hex}"/>
    <text x="256" y="330" font-family="Arial" font-size="240" font-weight="800" fill="#fff"
      text-anchor="middle">${name[5]!.toUpperCase()}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

// ───────────── Remove ─────────────

async function removeDemo() {
  const users = await db.user.findMany({
    where: { username: { startsWith: 'demo_' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return console.log('No demo accounts.');
  const generalIds = (
    await db.generalPost.findMany({ where: { authorId: { in: ids } }, select: { id: true } })
  ).map((p) => p.id);
  const business = await db.businessPost.findMany({
    where: { authorId: { in: ids } },
    select: { id: true, placeId: true },
  });
  const businessIds = business.map((p) => p.id);
  await db.$transaction(async (tx) => {
    await tx.vote.deleteMany({
      where: {
        OR: [
          { voterId: { in: ids } },
          { generalPostId: { in: generalIds } },
          { businessPostId: { in: businessIds } },
        ],
      },
    });
    // Comments by demo people, and every comment on demo posts (replies first).
    const commentWhere = {
      OR: [
        { authorUserId: { in: ids } },
        { generalPostId: { in: generalIds } },
        { businessPostId: { in: businessIds } },
      ],
    };
    const comments = await tx.comment.findMany({ where: commentWhere, select: { id: true } });
    const cids = comments.map((c) => c.id);
    await tx.vote.deleteMany({ where: { commentId: { in: cids } } });
    await tx.report.deleteMany({
      where: {
        OR: [
          { commentId: { in: cids } },
          { generalPostId: { in: generalIds } },
          { businessPostId: { in: businessIds } },
          { reportedUserId: { in: ids } },
          { reporterUserId: { in: ids } },
        ],
      },
    });
    for (let left = cids; left.length;) {
      // Delete leaves first (comments without remaining replies).
      const leaves = await tx.comment.findMany({
        where: { id: { in: left }, replies: { none: {} } },
        select: { id: true },
      });
      if (!leaves.length) break;
      await tx.comment.deleteMany({ where: { id: { in: leaves.map((l) => l.id) } } });
      left = left.filter((id) => !leaves.some((l) => l.id === id));
    }
    // Recount generalPost comment counts for TestAdmin posts that lost demo comments.
    await tx.$executeRaw`UPDATE "GeneralPost" p SET "commentCount" =
      (SELECT count(*) FROM "Comment" c WHERE c."generalPostId" = p.id AND c.status = 'VISIBLE')`;
    await tx.$executeRaw`UPDATE "BusinessPost" p SET "commentCount" =
      (SELECT count(*) FROM "Comment" c WHERE c."businessPostId" = p.id AND c.status = 'VISIBLE')`;
    // D94: their votes, suggestions and removal requests.
    await tx.placeChangeVote.deleteMany({ where: { voterId: { in: ids } } });
    await tx.placeRemoval.deleteMany({ where: { requesterId: { in: ids } } });
    await tx.businessSubmission.deleteMany({
      where: { submitterId: { in: ids }, status: { not: 'APPROVED' } },
    });
    await tx.photo.deleteMany({ where: { uploaderId: { in: ids } } });
    await tx.generalPost.deleteMany({ where: { id: { in: generalIds } } });
    await tx.businessPost.deleteMany({ where: { id: { in: businessIds } } });
    await tx.$executeRaw`UPDATE "BusinessPlace" pl SET "postCount" =
      (SELECT count(*) FROM "BusinessPost" b WHERE b."placeId" = pl.id AND b.status = 'VISIBLE')`;
    // Votes cast by demo people changed scores on others' posts: recount from votes.
    for (const t of ['GeneralPost', 'BusinessPost'] as const) {
      const col = t === 'GeneralPost' ? 'generalPostId' : 'businessPostId';
      await tx.$executeRawUnsafe(`UPDATE "${t}" p SET
        "upCount" = (SELECT count(*) FROM "Vote" v WHERE v."${col}" = p.id AND v.value = 1),
        "downCount" = (SELECT count(*) FROM "Vote" v WHERE v."${col}" = p.id AND v.value = -1),
        score = (SELECT coalesce(sum(v.value), 0) FROM "Vote" v WHERE v."${col}" = p.id)`);
    }
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });
  console.log(`Removed ${ids.length} demo accounts and everything they posted.`);
}

// ───────────── Create ─────────────

const HOUR = 3_600_000;
const pick = <T>(list: readonly T[], i: number) => list[i % list.length]!;

async function createDemo() {
  const anchor = await db.user.findUnique({
    where: { usernameNormalized: normalizeUsername(near) },
    select: { id: true, username: true },
  });
  if (!anchor) throw new Error(`No user named ${near}`);
  if (await db.user.findFirst({ where: { username: { startsWith: 'demo_' } } })) {
    throw new Error('Demo accounts already exist. Run with --remove first.');
  }

  // Where the anchor account posted: area points and places.
  const spots = await db.$queryRaw<{ id: string; latitude: number; longitude: number }[]>`
    SELECT p.id, ST_Y(p.location::geometry) AS latitude, ST_X(p.location::geometry) AS longitude
    FROM "GeneralPost" p WHERE p."authorId" = ${anchor.id}::uuid AND p.status = 'VISIBLE'`;
  const placeRows = await db.businessPost.findMany({
    where: { authorId: anchor.id, status: 'VISIBLE' },
    select: { id: true, placeId: true },
  });
  const places = [...new Set(placeRows.map((r) => r.placeId))];
  const anchorPosts = [
    ...spots.map((s) => ({ kind: 'general' as const, id: s.id })),
    ...placeRows.map((r) => ({ kind: 'business' as const, id: r.id })),
  ];
  console.log(`${anchor.username}: ${spots.length} area spots, ${places.length} places`);

  const passwordHash = await hashPassword(PASSWORD);
  const people = [];
  for (const p of PEOPLE) {
    const id = uuidv7();
    const user = await db.user.create({
      data: {
        id,
        username: p.username,
        usernameNormalized: normalizeUsername(p.username),
        ...encryptedEmailFields(id, `${p.username}@example.test`),
        emailVerifiedAt: new Date(),
        passwordHash,
        ageCutoffYear: 2007,
        tosAcceptedAt: new Date(),
        tosVersion: 'demo',
        adultConfirmedAt: new Date(),
        createdAt: new Date(Date.now() - 20 * 24 * HOUR),
      },
    });
    const pic = await uploadPhoto(user, await avatar(p.username, profileColor(p.color).hex));
    await db.profile.create({
      data: { userId: id, bio: p.bio, avatarPhotoId: pic.id, color: p.color },
    });
    people.push(user);
  }

  let n = 0;
  let photoN = 0;
  const made: { kind: 'general' | 'business'; id: string }[] = [];
  const age = () => new Date(Date.now() - (1 + ((n * 37) % 140)) * 0.5 * HOUR);

  // Area posts: 3 per spot, from different people; some with 1–4 photos, one GIF.
  for (const spot of spots) {
    for (let k = 0; k < 3; k++, n++) {
      const author = pick(people, n);
      const photoIds: string[] = [];
      const photos = n % 4 === 0 ? 0 : n % 4 === 1 ? 1 : n % 4 === 2 ? 2 : 4;
      for (let i = 0; i < photos; i++) {
        photoIds.push((await uploadPhoto(author, await photo(photoN++))).id);
      }
      if (n === 5) photoIds.splice(0, photoIds.length, (await uploadPhoto(author, await gif())).id);
      // Small offsets so posts sit around the spot, not on top of each other.
      const at = {
        latitude: spot.latitude + (k - 1) * 0.0004,
        longitude: spot.longitude + ((n % 3) - 1) * 0.0004,
      };
      const id = await createGeneralPost(author.id, at, pick(AREA_POSTS, n), false, photoIds);
      await db.generalPost.update({ where: { id }, data: { createdAt: age() } });
      made.push({ kind: 'general', id });
    }
  }

  // Place posts: 2 per place.
  for (const placeId of places) {
    for (let k = 0; k < 2; k++, n++) {
      const author = pick(people, n + 2);
      const photoIds =
        k === 0 ? [(await uploadPhoto(author, await photo(photoN++))).id] : ([] as string[]);
      const id = await createBusinessPost(
        author.id,
        placeId,
        pick(PLACE_POSTS, n),
        false,
        photoIds,
      );
      await db.businessPost.update({ where: { id }, data: { createdAt: age() } });
      made.push({ kind: 'business', id });
    }
  }

  // Comments (some replies) and votes, on demo posts and on the anchor's posts.
  let c = 0;
  for (const post of [...made, ...anchorPosts]) {
    for (let k = 0; k < 2; k++, c++) {
      const author = pick(people, c + 1);
      const first = await createComment({
        kind: post.kind,
        postId: post.id,
        author: { kind: 'USER', userId: author.id },
        body: pick(COMMENTS, c),
      });
      if (c % 3 === 0) {
        await createComment({
          kind: post.kind,
          postId: post.id,
          author: { kind: 'USER', userId: pick(people, c + 2).id },
          body: pick(COMMENTS, c + 3),
          parentCommentId: first,
        });
      }
    }
    for (const [i, voter] of people.entries()) {
      const v = (i + c) % 5 === 0 ? -1 : (i + c) % 3 === 0 ? 0 : 1;
      if (v) await castVote(voter.id, { type: post.kind, id: post.id }, v);
    }
  }

  // Two demo people are already friends with each other; one has asked the anchor.
  await sendFriendRequest(people[0]!.id, people[1]!.username);
  await sendFriendRequest(people[1]!.id, people[0]!.username);
  await sendFriendRequest(people[2]!.id, anchor.username);

  console.log(
    `Made ${people.length} people, ${made.length} posts, ${photoN} photos + 1 GIF, comments and votes.`,
  );
  console.log(`Accounts: ${people.map((p) => p.username).join(', ')}`);
  console.log(`Password for all of them: ${PASSWORD}`);
  console.log(`${people[2]!.username} sent ${anchor.username} a friend request.`);
}

/**
 * D94: a suggested place and a removal request near the anchor's area posts, each with a
 * few demo votes, so "Verify changes near you" has something to show.
 */
async function createChanges() {
  const anchor = await db.user.findUnique({
    where: { usernameNormalized: normalizeUsername(near) },
    select: { id: true },
  });
  if (!anchor) throw new Error(`No user named ${near}`);
  const demo = await db.user.findMany({
    where: { username: { startsWith: 'demo_' } },
    orderBy: { username: 'asc' },
  });
  if (demo.length < 4) throw new Error('Run demo:data first (demo accounts are needed).');
  const [spot] = await db.$queryRaw<{ latitude: number; longitude: number }[]>`
    SELECT ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
    FROM "GeneralPost" WHERE "authorId" = ${anchor.id}::uuid AND status = 'VISIBLE'
    ORDER BY "createdAt" DESC LIMIT 1`;
  if (!spot) throw new Error(`${near} has no area posts to put changes near.`);
  const at = { latitude: spot.latitude + 0.0005, longitude: spot.longitude };

  const s = await createSubmission(demo[0]!, at, {
    name: 'Corner Taco Window',
    category: 'fast_food',
  });
  for (const v of demo.slice(1, 3)) await castPlaceVote(v, { kind: 'add', id: s.id }, true, at);

  const [place] = await db.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name FROM "BusinessPlace"
    WHERE status = 'ACTIVE'
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${spot.longitude}, ${spot.latitude}), 4326)::geography, 400)
      AND NOT EXISTS (SELECT 1 FROM "PlaceRemoval" r WHERE r."placeId" = "BusinessPlace".id AND r.status = 'OPEN')
    ORDER BY random() LIMIT 1`;
  if (place) {
    const r = await requestRemoval(demo[3]!, place.id, at);
    await castPlaceVote(demo[4] ?? demo[1]!, { kind: 'remove', id: r.id }, false, at);
    console.log(`Removal request on "${place.name}" (1 closed, 1 still open).`);
  }
  console.log(`Suggested "Corner Taco Window" (3 of 10 "It's here" votes).`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Dev only.');
  if (args.includes('--remove')) await removeDemo();
  else if (args.includes('--changes')) await createChanges();
  else await createDemo();
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
