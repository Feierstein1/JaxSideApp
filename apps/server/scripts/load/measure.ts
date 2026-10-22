/**
 * P13.10: times the app's hot paths against the load database and explains their slowest SQL.
 *
 *   DATABASE_URL=postgresql://…/jax_load npm run load:measure -w @jax/server
 *
 * Runs the real server functions (feed, place discussion, chats, badges, friends, Places,
 * admin queue, profiles) through a database client that records every statement, then has
 * Postgres EXPLAIN (ANALYZE, BUFFERS) the slowest ones. Writes docs/LOAD_TEST_RESULTS.md.
 * Read-only apart from what the functions themselves do (none of them write).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const url = process.env.DATABASE_URL ?? '';
const dbName = new URL(url).pathname.slice(1);
if (!dbName.endsWith('_load')) throw new Error(`Refusing: "${dbName}" doesn't end with _load`);

type Q = { query: string; params: string; duration: number };
let captured: Q[] = [];
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
  log: [{ emit: 'event', level: 'query' }],
});
prisma.$on('query', (e) =>
  captured.push({ query: e.query, params: e.params, duration: e.duration }),
);
// The server's `db` reuses a client already on globalThis (see src/server/db.ts).
Object.assign(globalThis, { prisma, prismaClass: PrismaClient });

const RUNS = 5;
const AT = { latitude: 30.32, longitude: -81.67 }; // central Jacksonville, the densest area

interface Result {
  name: string;
  median: number;
  queries: number;
  slow: { ms: number; sql: string; plan: string }[];
}

async function main() {
  const { listFeed, listPlacePosts, listAuthorPosts, listMyPosts } =
    await import('../../src/server/discussions/posts');
  const { listConversations, unreadChats } = await import('../../src/server/social/messages');
  const { unreadCount, listNotifications } = await import('../../src/server/social/notifications');
  const { friendActivity } = await import('../../src/server/social/friends');
  const { searchPlaces } = await import('../../src/server/directory/places');
  const { listCases } = await import('../../src/server/admin/queue');
  const { db } = await import('../../src/server/db');
  if (db !== prisma) throw new Error('The server is not using the recording client');

  const pgc = new pg.Client({ connectionString: url });
  await pgc.connect();
  const one = async <T>(sql: string) => (await pgc.query(sql)).rows[0] as T;
  const counts = await one<Record<string, string>>(`SELECT
    (SELECT count(*) FROM "User") users, (SELECT count(*) FROM "GeneralPost") area_posts,
    (SELECT count(*) FROM "BusinessPost") place_posts, (SELECT count(*) FROM "Comment") comments,
    (SELECT count(*) FROM "Vote") votes, (SELECT count(*) FROM "Message") messages,
    (SELECT count(*) FROM "Conversation") chats, (SELECT count(*) FROM "Notification") notifications,
    (SELECT count(*) FROM "LocationCheck") location_checks,
    pg_size_pretty(pg_database_size(current_database())) size`);
  // A person who has chats, friends and notifications; the busiest place; a prolific author.
  const me = await one<{ id: string }>(
    `SELECT "userId" AS id FROM "ConversationMember" GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`,
  );
  const place = await one<{ id: string }>(
    `SELECT "placeId" AS id FROM "BusinessPost" GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`,
  );
  const author = await one<{ id: string }>(
    `SELECT "authorId" AS id FROM "GeneralPost" GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`,
  );
  const viewer = { id: me.id, generalRadiusMiles: null };

  const scenarios: [string, () => Promise<unknown>][] = [
    ['Area feed, newest', () => listFeed({ viewer, at: AT, sort: 'new' })],
    ['Area feed, top (7 days)', () => listFeed({ viewer, at: AT, sort: 'top' })],
    ['Area feed, @name search', () => listFeed({ viewer, at: AT, sort: 'new', q: '@load_1' })],
    ['Place discussion', () => listPlacePosts({ viewerId: me.id, placeId: place.id })],
    ['Chat list', () => listConversations(me.id)],
    ['Unread chats badge', () => unreadChats(me.id)],
    ['Notification badge', () => unreadCount(me.id)],
    ['Notification list', () => listNotifications(me.id)],
    ['Friends feed', () => friendActivity(me.id)],
    ['Places near you', () => searchPlaces({ userId: me.id, ...AT, offset: 0 })],
    [
      'Places search by name',
      () => searchPlaces({ userId: me.id, ...AT, q: 'load place 12', offset: 0 }),
    ],
    ['Profile: their posts', () => listAuthorPosts(author.id, me.id, AT)],
    ['Profile: your posts', () => listMyPosts(author.id, AT)],
    ['Admin queue', () => listCases()],
  ];

  const results: Result[] = [];
  for (const [name, run] of scenarios) {
    await run(); // warm-up
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      captured = [];
      const t = performance.now();
      await run();
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const last = captured;
    const slowest = [...last].sort((a, b) => b.duration - a.duration).slice(0, 2);
    const slow = [];
    for (const q of slowest) {
      let plan: string;
      try {
        const params = JSON.parse(q.params) as unknown[];
        const r = await pgc.query(`EXPLAIN (ANALYZE, BUFFERS) ${q.query}`, params);
        plan = r.rows.map((row) => row['QUERY PLAN']).join('\n');
      } catch (e) {
        plan = `(couldn't explain: ${(e as Error).message})`;
      }
      slow.push({ ms: q.duration, sql: q.query, plan });
    }
    const median = times[Math.floor(RUNS / 2)]!;
    results.push({ name, median, queries: last.length, slow });
    console.log(
      `${name.padEnd(26)} ${median.toFixed(1).padStart(8)} ms  ${String(last.length).padStart(3)} queries`,
    );
  }
  await pgc.end();
  await prisma.$disconnect();

  const seqScans = (plan: string) =>
    plan
      .split('\n')
      .filter((l) =>
        /Seq Scan on "?(Vote|Message|Comment|GeneralPost|BusinessPost|Notification|LocationCheck|Report|Friendship)/.test(
          l,
        ),
      )
      .map((l) => l.trim());
  const lines = [
    '# Load Test Results (P13.10)',
    '',
    `Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC on the development machine`,
    '(Docker: 2 CPUs, 3 GB memory), database `' + dbName + '`, filled by `npm run load:seed`',
    `at scale ${process.env.LOAD_SCALE ?? '0.2'}. Each time is the median of ${RUNS} runs after one warm-up,`,
    'measured from Node (so it includes Prisma and the driver, not the network).',
    '',
    '## Data',
    '',
    '| ' + Object.keys(counts).join(' | ') + ' |',
    '|' +
      Object.keys(counts)
        .map(() => '---')
        .join('|') +
      '|',
    '| ' + Object.values(counts).join(' | ') + ' |',
    '',
    '## Timings',
    '',
    '| Path | Median | Queries | Slowest statement | Big-table full scans |',
    '|---|---:|---:|---:|---|',
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.median.toFixed(1)} ms | ${r.queries} | ${(r.slow[0]?.ms ?? 0).toFixed(0)} ms | ${
          r.slow
            .flatMap((s) => seqScans(s.plan))
            .map((l) => '`' + l.replace(/\s+\(cost.*$/, '') + '`')
            .join('<br>') || 'none'
        } |`,
    ),
    '',
    '## Query plans of the slowest statements',
    '',
    ...results.flatMap((r) => [
      `### ${r.name}`,
      '',
      ...r.slow.flatMap((s) => [
        `${s.ms} ms:`,
        '',
        '```sql',
        s.sql.replace(/\s+/g, ' ').slice(0, 1500),
        '```',
        '',
        '```',
        s.plan,
        '```',
        '',
      ]),
    ]),
  ];
  const out = path.resolve(import.meta.dirname, '../../../../docs/LOAD_TEST_RESULTS.md');
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`Wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
