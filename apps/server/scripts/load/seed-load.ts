/**
 * P13.10: fills a scratch database with launch-scale fake data for the load test.
 *
 *   DATABASE_URL=postgresql://…/jax_load npm run load:seed -w @jax/server
 *   LOAD_SCALE=1 for full size (default 0.2: one fifth).
 *
 * Full size (scale 1): 50k users, 1M posts (80% area, 20% place), 3 comments and 20 votes per
 * post, 10M messages in 500k chats, 10 notifications per person, 2% of posts reported,
 * 5M location-history rows over 30 days. Users stay 50k at any scale.
 *
 * Refuses to run unless the database name ends in "_load", so it can never touch dev or test
 * data. Create the database first with `prisma migrate deploy` against that URL. Run once on an
 * empty database. Messages have random bytes for bodies (realistic size) except each chat's
 * newest, which is empty, so the chat list can build its preview without real ciphertext.
 */
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { createUserKey } from '../../src/server/crypto/field-encryption';
import { uuidv7 } from '../../src/server/crypto/uuid';
import { seed } from '../../prisma/seed';

const url = process.env.DATABASE_URL ?? '';
const dbName = new URL(url).pathname.slice(1);
if (!dbName.endsWith('_load')) {
  throw new Error(
    `Refusing: "${dbName}" doesn't end with _load (load data only goes in a scratch database)`,
  );
}
const SCALE = Number(process.env.LOAD_SCALE ?? '0.2');
const USERS = 50_000;
const POSTS = Math.round(1_000_000 * SCALE);
const AREA_POSTS = Math.round(POSTS * 0.8);
const PLACE_POSTS = POSTS - AREA_POSTS;
const CHATS = Math.round(500_000 * SCALE);
const PER_CHAT = 20;
const CHECKS = Math.round(5_000_000 * SCALE);

const c = new pg.Client({ connectionString: url });

async function step(label: string, sql: string, params: unknown[] = []) {
  const t = Date.now();
  const r = await c.query(sql, params);
  console.log(
    `${label.padEnd(28)} ${String(r.rowCount ?? '').padStart(10)} rows  ${((Date.now() - t) / 1000).toFixed(1)} s`,
  );
}

async function main() {
  await c.connect();
  const [{ n }] = (await c.query('SELECT count(*)::int AS n FROM "User"')).rows;
  if (n > 0) throw new Error("The load database isn't empty; drop and recreate it first.");
  console.log(`Seeding ${dbName} at scale ${SCALE}…`);

  // Settings, the Duval boundary, achievements, screening rules (no dev users or places).
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  await seed(prisma, { includeDevData: false });
  await prisma.$disconnect();

  await step(
    'users',
    `
    INSERT INTO "User" (id, username, "usernameNormalized", "emailVerifiedAt", "passwordHash",
      "tosAcceptedAt", "tosVersion", "adultConfirmedAt", "ageCutoffYear", "createdAt", "updatedAt",
      "emailIndex", "emailEnc", "dekWrapped")
    SELECT uuid_v7(), 'load_' || g, 'load_' || g, now(), '!', now(), 'load', now(), 2000,
           now() - interval '120 days', now(),
           -- Placeholder email material (never decrypted here): a unique 64-char index, random bytes.
           md5('load' || g) || md5('index' || g), decode(md5(random()::text) || md5(random()::text), 'hex'),
           decode(md5(random()::text) || md5(random()::text), 'hex')


    FROM generate_series(1, $1) g`,
    [USERS],
  );
  await step(
    'user numbering',
    `
    CREATE TABLE _lu AS SELECT (row_number() OVER (ORDER BY id))::int AS n, id FROM "User";
    ALTER TABLE _lu ADD PRIMARY KEY (n)`,
  );
  await step(
    'profiles',
    `INSERT INTO "Profile" ("userId", color, "updatedAt") SELECT id, 'teal', now() FROM _lu`,
  );

  // Places around central Jacksonville; posts denser near downtown / Five Points.
  await step(
    'places',
    `
    INSERT INTO "BusinessPlace" (id, name, "nameNormalized", category, latitude, longitude, location,
      "sourceName", "sourceId", "updatedAt")
    SELECT uuid_v7(), 'Load place ' || g, 'load place ' || g,
           (ARRAY['restaurant','cafe','bar','park','shop','church','fitness','museum'])[1 + g % 8],
           lat, lng, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, 'load', 'p' || g, now()
    FROM (SELECT g, 30.22 + random() * 0.22 AS lat, -81.75 + random() * 0.30 AS lng
          FROM generate_series(1, 4000) g) s`,
  );
  await step(
    'place numbering',
    `
    CREATE TABLE _lp AS SELECT (row_number() OVER (ORDER BY id))::int AS n, id FROM "BusinessPlace";
    ALTER TABLE _lp ADD PRIMARY KEY (n)`,
  );

  await step(
    'area posts',
    `
    INSERT INTO "GeneralPost" (id, "authorId", body, location, "createdAt", "updatedAt",
      "commentCount", score, "upCount")
    SELECT uuid_v7(), u.id, 'Load test area post number ' || g || ', about the neighborhood.',
           ST_SetSRID(ST_MakePoint(-81.67 + (random() - 0.5) * 0.14, 30.32 + (random() - 0.5) * 0.12), 4326)::geography,
           now() - random() * interval '60 days', now(), 3, 20, 20
    FROM generate_series(1, $1) g JOIN _lu u ON u.n = 1 + (g::bigint * 7919) % $2`,
    [AREA_POSTS, USERS],
  );
  await step(
    'place posts',
    `
    INSERT INTO "BusinessPost" (id, "placeId", "authorId", body, "createdAt", "updatedAt",
      "commentCount", score, "upCount")
    SELECT uuid_v7(), p.id, u.id, 'Load test place post number ' || g || '. Good coffee, busy at noon.',
           now() - random() * interval '60 days', now(), 3, 20, 20
    FROM generate_series(1, $1) g
    JOIN _lu u ON u.n = 1 + (g::bigint * 104729) % $2
    JOIN _lp p ON p.n = 1 + (g::bigint * 31) % 4000`,
    [PLACE_POSTS, USERS],
  );
  await step(
    'post numbering',
    `
    CREATE TABLE _lg AS SELECT (row_number() OVER (ORDER BY id))::int AS n, id FROM "GeneralPost";
    CREATE TABLE _lb AS SELECT (row_number() OVER (ORDER BY id))::int AS n, id FROM "BusinessPost"`,
  );

  await step(
    'comments (area)',
    `
    INSERT INTO "Comment" (id, "generalPostId", "authorKind", "authorUserId", body, "createdAt", "updatedAt")
    SELECT uuid_v7(), p.id, 'USER', u.id, 'A comment on this.', now() - random() * interval '30 days', now()
    FROM _lg p CROSS JOIN generate_series(1, 3) k JOIN _lu u ON u.n = 1 + (p.n * 3 + k) % $1`,
    [USERS],
  );
  await step(
    'comments (place)',
    `
    INSERT INTO "Comment" (id, "businessPostId", "authorKind", "authorUserId", body, "createdAt", "updatedAt")
    SELECT uuid_v7(), p.id, 'USER', u.id, 'A comment on this.', now() - random() * interval '30 days', now()
    FROM _lb p CROSS JOIN generate_series(1, 3) k JOIN _lu u ON u.n = 1 + (p.n * 3 + k) % $1`,
    [USERS],
  );
  // 20 different voters per post (distinct because 20 < 50k).
  await step(
    'votes (area)',
    `
    INSERT INTO "Vote" (id, "voterId", "generalPostId", value, "createdAt", "updatedAt")
    SELECT uuid_v7(), u.id, p.id, 1, now(), now()
    FROM _lg p CROSS JOIN generate_series(0, 19) k JOIN _lu u ON u.n = 1 + (p.n * 20 + k) % $1`,
    [USERS],
  );
  await step(
    'votes (place)',
    `
    INSERT INTO "Vote" (id, "voterId", "businessPostId", value, "createdAt", "updatedAt")
    SELECT uuid_v7(), u.id, p.id, 1, now(), now()
    FROM _lb p CROSS JOIN generate_series(0, 19) k JOIN _lu u ON u.n = 1 + (p.n * 20 + k) % $1`,
    [USERS],
  );

  // Everyone has 10 friends on each side (20 in all).
  await step(
    'friendships',
    `
    INSERT INTO "Friendship" (id, "userLowId", "userHighId", "requesterId", status, "createdAt", "acceptedAt")
    SELECT uuid_v7(), least(a.id, b.id), greatest(a.id, b.id), least(a.id, b.id), 'ACCEPTED', now(), now()
    FROM _lu a CROSS JOIN generate_series(1, 10) k JOIN _lu b ON b.n = 1 + (a.n - 1 + k) % $1`,
    [USERS],
  );

  // Chats between friends: each person with their next CHATS/USERS friends. Real keys per chat.
  const perUser = Math.max(1, Math.round(CHATS / USERS));
  const users = (await c.query<{ n: number; id: string }>('SELECT n, id FROM _lu ORDER BY n')).rows;
  const t = Date.now();
  let made = 0;
  for (let start = 0; start < users.length; start += 2000) {
    const ids: string[] = [],
      lows: string[] = [],
      highs: string[] = [],
      keys: string[] = [];
    for (const a of users.slice(start, start + 2000)) {
      for (let k = 1; k <= perUser; k++) {
        const b = users[(a.n - 1 + k) % USERS]!;
        const id = uuidv7();
        ids.push(id);
        lows.push(a.id < b.id ? a.id : b.id);
        highs.push(a.id < b.id ? b.id : a.id);
        keys.push(Buffer.from(createUserKey(`conversation:${id}`).wrapped).toString('hex'));
      }
    }
    await c.query(
      `INSERT INTO "Conversation" (id, "userLowId", "userHighId", "dekWrapped", "createdAt", "lastMessageAt")
       SELECT i, l, h, decode(k, 'hex'), now() - interval '30 days', now()
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[]) AS x(i, l, h, k)`,
      [ids, lows, highs, keys],
    );
    made += ids.length;
  }
  console.log(
    `${'chats'.padEnd(28)} ${String(made).padStart(10)} rows  ${((Date.now() - t) / 1000).toFixed(1)} s`,
  );
  await step(
    'chat members',
    `
    INSERT INTO "ConversationMember" ("conversationId", "userId", "lastReadAt")
    SELECT id, "userLowId", now() - interval '1 day' FROM "Conversation"
    UNION ALL SELECT id, "userHighId", NULL FROM "Conversation"`,
  );
  await step(
    'messages',
    `
    INSERT INTO "Message" (id, "conversationId", "senderId", "bodyEnc", "createdAt")
    SELECT uuid_v7(), cv.id, CASE WHEN k % 2 = 0 THEN cv."userLowId" ELSE cv."userHighId" END,
           CASE WHEN k = $1 THEN NULL
                ELSE decode(md5(random()::text) || md5(random()::text) || md5(random()::text) ||
                            md5(random()::text) || md5(random()::text), 'hex') END,
           now() - interval '30 days' + k * interval '1 hour'
    FROM "Conversation" cv CROSS JOIN generate_series(1, $1) k`,
    [PER_CHAT],
  );

  await step(
    'notifications',
    `
    INSERT INTO "Notification" (id, "userId", type, "actorId", "createdAt", "readAt")
    SELECT uuid_v7(), u.id, 'FRIEND_ACCEPTED', a.id, now() - k * interval '2 days',
           CASE WHEN k > 5 THEN now() - interval '1 day' END
    FROM _lu u CROSS JOIN generate_series(1, 10) k JOIN _lu a ON a.n = 1 + (u.n + k) % $1`,
    [USERS],
  );
  // 2% of area posts reported; one in ten of those still open.
  await step(
    'reports',
    `
    INSERT INTO "Report" (id, "reporterUserId", "generalPostId", reason, status, "createdAt")
    SELECT uuid_v7(), u.id, p.id, 'SPAM',
           (CASE WHEN p.n % 500 = 0 THEN 'OPEN' ELSE 'DISMISSED' END)::"ReportStatus",
           now() - random() * interval '30 days'
    FROM _lg p JOIN _lu u ON u.n = 1 + (p.n * 13) % $1
    WHERE p.n % 50 = 0`,
    [USERS],
  );
  // Location history for writes over 30 days (the daily pieces).
  await step(
    'location checks',
    `
    INSERT INTO "LocationCheck" (id, "userId", action, point, "accuracyMeters", "readingAt", "receivedAt", result)
    SELECT uuid_v7(), u.id, 'general.post',
           ST_SetSRID(ST_MakePoint(-81.67 + (random() - 0.5) * 0.14, 30.32 + (random() - 0.5) * 0.12), 4326)::geography,
           10, ts, ts, 'ALLOWED'
    FROM (SELECT g, now() - random() * interval '29 days' AS ts FROM generate_series(1, $1) g) s
    JOIN _lu u ON u.n = 1 + (g::bigint * 7) % $2`,
    [CHECKS, USERS],
  );

  await step('drop helper tables', 'DROP TABLE _lu, _lp, _lg, _lb');
  await step('analyze', 'ANALYZE');
  const size = (await c.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`))
    .rows[0].s;
  console.log(`Done. Database size: ${size}`);
  await c.end();
}

main().catch(async (e) => {
  console.error(e);
  await c.end().catch(() => undefined);
  process.exit(1);
});
