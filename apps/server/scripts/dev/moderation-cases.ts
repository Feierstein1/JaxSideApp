/**
 * Dev only (P15.8): fills the admin portal with one realistic case of every kind, so each
 * moderation flow can be walked through and checked:
 *
 *   area post (spam, 3 reports, so already auto-hidden) · area post (harassment) ·
 *   place post (scam) · comment (threat) · photo · private message · topic ·
 *   profile (impersonation: username and bio) · a post held by screening ·
 *   a warning with an open appeal · a suspended account
 *
 *   npm run demo:moderation -w @jax/server
 *   npm run demo:moderation -w @jax/server -- --remove   (deletes every mod_ account and its content)
 *
 * Accounts are named mod_*, confirmed, and share one password (printed at the end), so you
 * can also sign in to the app as the offender or a reporter. Runs the real server functions
 * (reports group into cases and auto-hide like in the app). Refuses to run in production.
 */
import sharp from 'sharp';
import { normalizeUsername } from '@jax/shared';
import type { User } from '../../src/generated/prisma/client';
import { hashPassword } from '../../src/server/auth/crypto';
import { encryptedEmailFields } from '../../src/server/crypto/field-encryption';
import { uuidv7 } from '../../src/server/crypto/uuid';
import { db } from '../../src/server/db';
import { createComment } from '../../src/server/discussions/comments';
import { createBusinessPost, createGeneralPost } from '../../src/server/discussions/posts';
import { uploadPhoto } from '../../src/server/media/photos';
import { createAppeal } from '../../src/server/moderation/appeals';
import { issueStrike, suspendUser } from '../../src/server/moderation/enforcement';
import { createReport } from '../../src/server/reports';
import { pair } from '../../src/server/social/friends';
import { sendMessage } from '../../src/server/social/messages';
import { createUserTopic } from '../../src/server/topics';

const PASSWORD = 'JaxModCases-2026!';
const DOWNTOWN = { latitude: 30.3274, longitude: -81.6588 };
const at = (k: number) => ({
  latitude: DOWNTOWN.latitude + k * 0.0004,
  longitude: DOWNTOWN.longitude,
});

async function person(username: string, bio?: string): Promise<User> {
  const id = uuidv7();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const user = await db.user.create({
    data: {
      id,
      username,
      usernameNormalized: normalizeUsername(username),
      ...encryptedEmailFields(id, `${username.toLowerCase()}@example.test`),
      passwordHash: await hashPassword(PASSWORD),
      ageCutoffYear: 2000,
      tosAcceptedAt: monthAgo,
      tosVersion: 'dev',
      adultConfirmedAt: monthAgo,
      emailVerifiedAt: monthAgo,
      createdAt: monthAgo,
    },
  });
  await db.profile.create({ data: { userId: id, bio: bio ?? null, color: 'slate' } });
  return user;
}

const report = (
  by: User,
  target: Parameters<typeof createReport>[1]['target'],
  reason: Parameters<typeof createReport>[1]['reason'],
  details?: string,
) => createReport({ kind: 'user', user: by }, { target, reason, details });

async function remove() {
  const users = await db.user.findMany({
    where: { usernameNormalized: { startsWith: 'mod_' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return console.log('No mod_ accounts.');
  const mine = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);
  const general = mine(
    await db.generalPost.findMany({ where: { authorId: { in: ids } }, select: { id: true } }),
  );
  const business = mine(
    await db.businessPost.findMany({ where: { authorId: { in: ids } }, select: { id: true } }),
  );
  await db.$transaction(async (tx) => {
    const comments = mine(
      await tx.comment.findMany({
        where: {
          OR: [
            { authorUserId: { in: ids } },
            { generalPostId: { in: general } },
            { businessPostId: { in: business } },
          ],
        },
        select: { id: true },
      }),
    );
    await tx.report.deleteMany({
      where: {
        OR: [
          { reporterUserId: { in: ids } },
          { reportedUserId: { in: ids } },
          { generalPostId: { in: general } },
          { businessPostId: { in: business } },
          { commentId: { in: comments } },
        ],
      },
    });
    await tx.moderationAction.deleteMany({ where: { targetUserId: { in: ids } } });
    await tx.vote.deleteMany({
      where: {
        OR: [
          { voterId: { in: ids } },
          { generalPostId: { in: general } },
          { businessPostId: { in: business } },
          { commentId: { in: comments } },
        ],
      },
    });
    await tx.comment.deleteMany({ where: { id: { in: comments } } });
    await tx.photo.deleteMany({ where: { uploaderId: { in: ids } } });
    await tx.generalPost.deleteMany({ where: { id: { in: general } } });
    await tx.businessPost.deleteMany({ where: { id: { in: business } } });
    await tx.$executeRaw`UPDATE "BusinessPlace" pl SET "postCount" =
      (SELECT count(*) FROM "BusinessPost" b WHERE b."placeId" = pl.id AND b.status = 'VISIBLE')`;
    await tx.cityTopic.deleteMany({ where: { createdById: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });
  console.log(`Removed ${ids.length} mod_ accounts and everything they posted.`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Dev only.');
  if (process.argv.includes('--remove')) return remove();
  if (await db.user.findFirst({ where: { usernameNormalized: 'mod_troll' } })) {
    throw new Error('Moderation cases already exist. Run with --remove first.');
  }

  const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  if (!admin) throw new Error('No admin account (npm run admin:promote -w @jax/server -- <name>)');
  const place = await db.businessPlace.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  });
  if (!place) throw new Error('No places (import the directory first)');

  const troll = await person('mod_troll', 'Just here to stir things up.');
  const spammer = await person('mod_spammer', 'DM me for cheap followers and free gift cards');
  const fake = await person(
    'mod_JSO_Official',
    'Official Jacksonville Sheriff’s Office account. Report crimes to me here.',
  );
  const appealer = await person('mod_appealer');
  const suspended = await person('mod_suspended');
  const reps = [await person('mod_rep1'), await person('mod_rep2'), await person('mod_rep3')];

  // 1. Spam, reported by three people: hidden automatically before anyone reviews it.
  const spamPost = await createGeneralPost(
    spammer.id,
    at(0),
    'Make $500 a day from home!!! No experience needed, DM me now before spots fill up 💰💰',
  );
  for (const r of reps) await report(r, { type: 'general', id: spamPost }, 'SPAM');

  // 2. Harassment of a neighbor, one report with details.
  const mean = await createGeneralPost(
    troll.id,
    at(1),
    'To the lady with the loud dog on Main St: you are pathetic and everyone on this street laughs at you.',
  );
  await report(
    reps[0]!,
    { type: 'general', id: mean },
    'HARASSMENT',
    'Targets a specific neighbor.',
  );

  // 3. A scam in a place's discussion.
  const scam = await createBusinessPost(
    spammer.id,
    place.id,
    'This place is giving away $100 gift cards! Send your email and phone number to claim yours.',
  );
  await report(reps[1]!, { type: 'business', id: scam }, 'SCAM');

  // 4. A threatening comment under an ordinary post.
  const host = await createGeneralPost(
    reps[2]!.id,
    at(2),
    'Anyone know why the bridge was closed this morning?',
  );
  const threat = await createComment({
    kind: 'general',
    postId: host,
    author: { kind: 'USER', userId: troll.id },
    body: 'Keep asking questions and see what happens to you. I know where you park.',
  });
  await report(reps[2]!, { type: 'comment', id: threat }, 'THREAT');

  // 5. A photo someone says is inappropriate (a drawn stand-in image).
  const image = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 180, g: 40, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  const pic = await uploadPhoto(troll, image);
  await createGeneralPost(troll.id, at(3), 'Look at this lol', false, [pic.id]);
  await report(reps[0]!, { type: 'photo', id: pic.id }, 'SEXUAL_CONTENT', 'Not OK to post here.');

  // 6. A harassing private message between friends (only someone in the chat can report it).
  await db.friendship.create({
    data: { ...pair(troll.id, reps[1]!.id), requesterId: troll.id, status: 'ACCEPTED' },
  });
  const msg = await sendMessage(troll, {
    to: reps[1]!.username,
    body: 'Unfriend me again and I’ll post your address on here.',
  });
  await report(reps[1]!, { type: 'message', id: msg.id }, 'HARASSMENT');

  // 7. A spam topic: the spam phrases (D142) hold it for review by themselves.
  const { held } = await createUserTopic(
    spammer.id,
    {
      reading: { ...DOWNTOWN, accuracyMeters: 10, timestamp: Date.now() },
      scope: 'city',
      title: 'Crypto giveaway for Jacksonville residents',
      category: 'other',
      description: 'Send 0.1 BTC and get 1 BTC back. Limited time!',
      showCreator: true,
    },
    DOWNTOWN,
  );
  if (!held) throw new Error('Expected the spam topic to be held by screening');

  // 8. A profile pretending to be the Sheriff's Office (username and bio).
  await report(
    reps[0]!,
    { type: 'user', username: fake.username },
    'IMPERSONATION',
    'Not the real JSO.',
  );

  // 9. A post screening held for review ("coon" has innocent uses, so it's held, not blocked).
  await createGeneralPost(
    reps[1]!.id,
    at(4),
    'My coon hound got out again, has anyone seen her near the park?',
    true,
  );

  // 10. A warning that was appealed.
  await issueStrike({
    adminId: admin.id,
    userId: appealer.id,
    reason: 'Insulting another member in a comment.',
  });
  const warning = await db.moderationAction.findFirstOrThrow({
    where: { targetUserId: appealer.id },
    orderBy: { createdAt: 'desc' },
  });
  await createAppeal(appealer, {
    actionId: warning.id,
    message:
      'I was joking with a friend, we know each other in real life. Sorry for the confusion.',
  });

  // 11. A suspended account (to try lifting it early).
  await suspendUser({
    adminId: admin.id,
    userId: suspended.id,
    hours: 24,
    reason: 'Repeated spam in place discussions.',
  });

  console.log(`Moderation cases ready (place: ${place.name}).`);
  console.log(
    'Reports queue: 8 cases (area post ×2, place post, comment, photo, message, topic held by screening, profile)',
  );
  console.log('Held for review: 1 post · Appeals: 1 · Suspended: mod_suspended');
  console.log(`Every mod_ account's password: ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
