/**
 * P15.12: daily-volume stress test. Plays a busy day of JaxSide through the real HTTP API,
 * writes and reads together: posts (text, photos, voice, video, in topics), comments, votes,
 * poll votes, messages, feeds, post pages, topic lists, the unread badges the app polls, and
 * the photo / voice / video downloads behind the signed links. Then reports response times
 * per action, errors, database growth and storage, and writes docs/STRESS_TEST_RESULTS.md.
 *
 *   1. One time: create the scratch database and its tables
 *        createdb jax_load   (or: docker exec jaxapp-postgres-1 createdb -U <user> jax_load)
 *        DATABASE_URL=postgresql://…/jax_load npx prisma migrate deploy
 *   2. npm run build -w @jax/server   (the test starts the built server itself)
 *   3. DATABASE_URL=postgresql://…/jax_load npm run load:daily -w @jax/server
 *
 * STRESS_PEOPLE   people active that day (default 1000); every count below scales with it
 * STRESS_WORKERS  requests in flight at once (default 24)
 * STRESS_PORT     port for the test server (default 3100)
 * STRESS_URL      use an already-running server instead (it must be on the same _load database)
 *
 * Refuses any database whose name doesn't end in "_load", and any STRESS_URL that isn't this
 * computer. Uploads go to their own buckets (jax-load-media, jax-load-quarantine). Each run adds
 * new people (names start with "s<run>_"), so runs can be repeated on the same database.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { CONFIG_DEFAULTS } from '@jax/shared';
import { PrismaClient } from '../../src/generated/prisma/client';
import { makePhotos, makeVideo, makeVoice } from './media-fixtures';

const url = process.env.DATABASE_URL ?? '';
const dbName = new URL(url).pathname.slice(1);
if (!dbName.endsWith('_load')) throw new Error(`Refusing: "${dbName}" doesn't end with _load`);

const PEOPLE = Number(process.env.STRESS_PEOPLE ?? '1000');
const WORKERS = Number(process.env.STRESS_WORKERS ?? '24');
const PORT = Number(process.env.STRESS_PORT ?? '3100');
const BASE = process.env.STRESS_URL ?? `http://127.0.0.1:${PORT}`;
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) {
  throw new Error('Refusing: STRESS_URL must be this computer');
}
const MEDIA_BUCKET = 'jax-load-media';
const QUARANTINE_BUCKET = 'jax-load-quarantine';
const RUN = Date.now().toString(36).slice(-4);

/**
 * A busy day, per active person. Reads follow how the app is used: the feed on open and on
 * refresh, a few posts opened, photos loading as they scroll, and the Messages and bell
 * badges checked every 30 s while the app is open (about 20 minutes a day).
 */
const PER_PERSON: Record<Action, number> = {
  feed: 12,
  feedTop: 3,
  openPost: 8,
  topicList: 2,
  topicPosts: 2,
  pollList: 1,
  unreadMessages: 40,
  unreadNotifications: 40,
  notifications: 2,
  chats: 1,
  photoDownload: 20,
  voiceDownload: 1,
  videoDownload: 0.5,
  postText: 0.35,
  postPhotos: 0.12,
  postVoice: 0.02,
  postVideo: 0.01,
  postInTopic: 0.05,
  comment: 3,
  votePost: 12,
  voteComment: 4,
  pollVote: 0.5,
  message: 3,
};
type Action =
  | 'feed'
  | 'feedTop'
  | 'openPost'
  | 'topicList'
  | 'topicPosts'
  | 'pollList'
  | 'unreadMessages'
  | 'unreadNotifications'
  | 'notifications'
  | 'chats'
  | 'photoDownload'
  | 'voiceDownload'
  | 'videoDownload'
  | 'postText'
  | 'postPhotos'
  | 'postVoice'
  | 'postVideo'
  | 'postInTopic'
  | 'comment'
  | 'votePost'
  | 'voteComment'
  | 'pollVote'
  | 'message';
const WRITES = new Set<Action>([
  'postText',
  'postPhotos',
  'postVoice',
  'postVideo',
  'postInTopic',
  'comment',
  'votePost',
  'voteComment',
  'pollVote',
  'message',
]);
/** Timed alone before the load (reads, the common writes, a photo post). */
const QUIET_ACTIONS: Action[] = [
  'feed',
  'openPost',
  'unreadMessages',
  'photoDownload',
  'topicList',
  'votePost',
  'comment',
  'postText',
  'postPhotos',
  'message',
];
/** Share of a day's requests in its busiest hour (evenings), for the "can it keep up" check. */
const PEAK_HOUR_SHARE = 0.15;

// Neighborhoods people are spread over; each person stays near one, so posts have neighbors
// close enough (D20) to comment and vote, and nobody trips the travel check.
const AREAS = [
  { name: 'Downtown', latitude: 30.3274, longitude: -81.6588 },
  { name: 'Riverside', latitude: 30.3115, longitude: -81.6851 },
  { name: 'San Marco', latitude: 30.3036, longitude: -81.6517 },
  { name: 'Southside', latitude: 30.2566, longitude: -81.5866 },
  { name: 'Jax Beach', latitude: 30.2867, longitude: -81.3962 },
];

interface Person {
  id: string;
  username: string;
  token: string;
  area: number;
  latitude: number;
  longitude: number;
  friend: string;
  /** Polls this person already answered (one vote each). */
  voted: Set<string>;
}
interface Pools {
  posts: string[];
  comments: string[];
}
const pools: Pools[] = AREAS.map(() => ({ posts: [], comments: [] }));
const media = { photo: [] as string[], voice: [] as string[], video: [] as string[] };
const topicIds: string[] = [];
let polls: { id: string; choiceIds: string[] }[] = [];

const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];
const remember = (xs: string[], x: string, max = 2000) => {
  xs.push(x);
  if (xs.length > max) xs.splice(0, xs.length - max);
};
const reading = (p: Person) => ({
  latitude: p.latitude,
  longitude: p.longitude,
  accuracyMeters: 12,
  timestamp: Date.now() - 1_000,
});

const WORDS =
  'coffee traffic bridge river park tacos rain beach festival game parking library market music dog trail weekend sunset brunch pothole concert'.split(
    ' ',
  );
let counter = 0;
const sentence = (n = 12) =>
  `${Array.from({ length: n }, () => pick(WORDS)).join(' ')} (${RUN}-${++counter})`;

// ── Measurements ──
interface Stat {
  ms: number[];
  errors: Map<string, number>;
  up: number;
  down: number;
}
const stats = new Map<string, Stat>();
/** Each action timed on its own, one request at a time, before the load starts. */
const quiet = new Map<string, Stat>();
let recording = stats;
function stat(name: string): Stat {
  let s = recording.get(name);
  if (!s) recording.set(name, (s = { ms: [], errors: new Map(), up: 0, down: 0 }));
  return s;
}

async function call(
  name: string,
  p: Person | null,
  method: 'GET' | 'POST' | 'PUT',
  route: string,
  body?: unknown,
  raw?: { bytes: Buffer; type: string },
): Promise<{ status: number; json: unknown; bytes: number }> {
  const s = stat(name);
  const headers: Record<string, string> = {};
  if (p) headers.authorization = `Bearer ${p.token}`;
  let payload: BodyInit | undefined;
  if (raw) {
    headers['content-type'] = raw.type;
    payload = new Uint8Array(raw.bytes);
    s.up += raw.bytes.length;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const t = performance.now();
  try {
    const res = await fetch(new URL(route, BASE), { method, headers, body: payload });
    const buf = Buffer.from(await res.arrayBuffer());
    s.ms.push(performance.now() - t);
    s.down += buf.length;
    let json: unknown = null;
    if (res.headers.get('content-type')?.includes('json')) json = JSON.parse(buf.toString());
    if (res.status >= 400) {
      const code = (json as { error?: { code?: string } } | null)?.error?.code ?? '';
      const key = `${res.status} ${code}`.trim();
      s.errors.set(key, (s.errors.get(key) ?? 0) + 1);
    }
    return { status: res.status, json, bytes: buf.length };
  } catch (err) {
    s.ms.push(performance.now() - t);
    const key = `network ${(err as Error).message.slice(0, 40)}`;
    s.errors.set(key, (s.errors.get(key) ?? 0) + 1);
    return { status: 0, json: null, bytes: 0 };
  }
}

type PostJson = {
  id: string;
  photos?: { url: string }[];
  voice?: { url: string } | null;
  video?: { url: string } | null;
};
/**
 * Keeps signed media links from what the server sent back, and the IDs of posts written in
 * this person's own area (a feed also shows neighboring areas, too far to comment on, D20).
 */
function harvest(area: number, posts: PostJson[] | undefined, own = false) {
  for (const post of posts ?? []) {
    if (own) remember(pools[area]!.posts, post.id);
    for (const ph of post.photos ?? []) remember(media.photo, ph.url, 500);
    if (post.voice) remember(media.voice, post.voice.url, 200);
    if (post.video) remember(media.video, post.video.url, 100);
  }
}

// ── The actions ──
let photos: Buffer[] = [];
async function upload(p: Person, kind: 'photos' | 'voice' | 'videos', name: string) {
  const raw =
    kind === 'photos'
      ? { bytes: pick(photos)!, type: 'image/jpeg' }
      : kind === 'voice'
        ? { bytes: makeVoice(15 + Math.floor(Math.random() * 45)), type: 'audio/mp4' }
        : { bytes: makeVideo(10 + Math.floor(Math.random() * 20)), type: 'video/quicktime' };
  const r = await call(name, p, 'POST', `/api/v1/${kind}`, undefined, raw);
  return (r.json as { id?: string } | null)?.id;
}

async function createPost(p: Person, extra: Record<string, unknown>, name: string) {
  const r = await call(name, p, 'POST', '/api/v1/posts', {
    reading: reading(p),
    body: sentence(),
    ...extra,
  });
  const post = (r.json as { post?: PostJson } | null)?.post;
  if (post) harvest(p.area, [post], !extra.topicId);
}

const ACTIONS: Record<Action, (p: Person) => Promise<unknown>> = {
  feed: async (p) => {
    const r = await call('feed', p, 'POST', '/api/v1/feed', { reading: reading(p) });
    harvest(p.area, (r.json as { posts?: PostJson[] } | null)?.posts);
  },
  feedTop: (p) => call('feedTop', p, 'POST', '/api/v1/feed', { reading: reading(p), sort: 'top' }),
  openPost: async (p) => {
    const id = pick(pools[p.area]!.posts);
    if (!id) return ACTIONS.feed(p);
    const r = await call('openPost', p, 'POST', `/api/v1/posts/${id}`, { reading: reading(p) });
    for (const c of (r.json as { comments?: { id: string }[] } | null)?.comments ?? []) {
      remember(pools[p.area]!.comments, c.id);
    }
  },
  topicList: (p) =>
    call('topicList', p, 'POST', '/api/v1/topics/list', { reading: reading(p), scope: 'city' }),
  topicPosts: (p) => {
    const id = pick(topicIds);
    return id
      ? call('topicPosts', p, 'POST', `/api/v1/topics/${id}/posts/list`, { reading: reading(p) })
      : ACTIONS.topicList(p);
  },
  pollList: (p) => call('pollList', p, 'GET', '/api/v1/polls'),
  unreadMessages: (p) => call('unreadMessages', p, 'GET', '/api/v1/messages/unread'),
  unreadNotifications: (p) => call('unreadNotifications', p, 'GET', '/api/v1/notifications/unread'),
  notifications: (p) => call('notifications', p, 'GET', '/api/v1/notifications'),
  chats: (p) => call('chats', p, 'GET', '/api/v1/messages'),
  photoDownload: (p) => {
    const link = pick(media.photo);
    return link ? call('photoDownload', null, 'GET', link) : ACTIONS.feed(p);
  },
  voiceDownload: (p) => {
    const link = pick(media.voice);
    return link ? call('voiceDownload', null, 'GET', link) : ACTIONS.feed(p);
  },
  videoDownload: (p) => {
    const link = pick(media.video);
    return link ? call('videoDownload', null, 'GET', link) : ACTIONS.feed(p);
  },
  postText: (p) => createPost(p, {}, 'postText'),
  postPhotos: async (p) => {
    const ids: string[] = [];
    for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
      const id = await upload(p, 'photos', 'uploadPhoto');
      if (id) ids.push(id);
    }
    if (ids.length) await createPost(p, { photoIds: ids }, 'postPhotos');
  },
  postVoice: async (p) => {
    const id = await upload(p, 'voice', 'uploadVoice');
    if (id) await createPost(p, { voiceId: id }, 'postVoice');
  },
  postVideo: async (p) => {
    const id = await upload(p, 'videos', 'uploadVideo');
    if (id) await createPost(p, { videoId: id }, 'postVideo');
  },
  postInTopic: (p) => {
    const id = pick(topicIds);
    return id ? createPost(p, { topicId: id }, 'postInTopic') : ACTIONS.postText(p);
  },
  comment: async (p) => {
    const id = pick(pools[p.area]!.posts);
    if (!id) return ACTIONS.postText(p);
    const r = await call('comment', p, 'POST', `/api/v1/posts/${id}/comments`, {
      reading: reading(p),
      body: sentence(8),
    });
    const c = (r.json as { comment?: { id: string } } | null)?.comment;
    if (c) remember(pools[p.area]!.comments, c.id);
  },
  votePost: (p) => {
    const id = pick(pools[p.area]!.posts);
    return id
      ? call('votePost', p, 'PUT', `/api/v1/posts/${id}/vote`, {
          reading: reading(p),
          value: Math.random() < 0.85 ? 1 : -1,
        })
      : ACTIONS.feed(p);
  },
  voteComment: (p) => {
    const id = pick(pools[p.area]!.comments);
    return id
      ? call('voteComment', p, 'PUT', `/api/v1/comments/${id}/vote`, {
          reading: reading(p),
          value: 1,
        })
      : ACTIONS.openPost(p);
  },
  pollVote: (p) => {
    const poll = pick(polls.filter((x) => !p.voted.has(x.id)));
    if (!poll) return ACTIONS.pollList(p);
    p.voted.add(poll.id);
    return call('pollVote', p, 'POST', `/api/v1/polls/${poll.id}/vote`, {
      reading: reading(p),
      choiceIds: [pick(poll.choiceIds)!],
    });
  },
  message: (p) =>
    call('message', p, 'POST', '/api/v1/messages', {
      reading: reading(p),
      to: p.friend,
      body: sentence(6),
    }),
};

// ── Setup: settings, people, friends, polls, topics ──
async function setUp(prisma: PrismaClient, pgc: pg.Client): Promise<Person[]> {
  const { seed } = await import('../../prisma/seed');
  await seed(prisma, { includeDevData: false });
  // Everyone here is a test robot hammering the API: lift the per-person limits so they
  // measure the server, not the rate limiter. Only in this _load database.
  const limits = Object.keys(CONFIG_DEFAULTS).filter((k) => k.startsWith('rateLimit.'));
  for (const key of limits) {
    await prisma.appConfiguration.upsert({
      where: { key },
      create: { key, value: 1_000_000 },
      update: { value: 1_000_000 },
    });
  }

  const { encryptedEmailFields } = await import('../../src/server/crypto/field-encryption');
  const { uuidv7 } = await import('../../src/server/crypto/uuid');
  const { createSession } = await import('../../src/server/auth/sessions');
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const people: Person[] = [];
  for (let i = 0; i < PEOPLE; i++) {
    const id = uuidv7();
    const username = `s${RUN}_${i}`;
    await prisma.user.create({
      data: {
        id,
        username,
        usernameNormalized: username.toLowerCase(),
        ...encryptedEmailFields(id, `${randomUUID()}@load.test`),
        passwordHash: 'x',
        ageCutoffYear: 2000,
        tosAcceptedAt: monthAgo,
        tosVersion: 'load',
        adultConfirmedAt: monthAgo,
        emailVerifiedAt: monthAgo,
        createdAt: monthAgo,
      },
    });
    const area = i % AREAS.length;
    // Within about 0.1 mi, so everyone in an area is inside the 0.3 mi radius of each other.
    const jitter = () => (Math.random() - 0.5) * 0.0025;
    people.push({
      id,
      username,
      token: (await createSession(id, 'MOBILE')).token,
      area,
      latitude: AREAS[area]!.latitude + jitter(),
      longitude: AREAS[area]!.longitude + jitter(),
      friend: '',
      voted: new Set(),
    });
  }
  // Friends in pairs (messages are friends only).
  for (let i = 0; i + 1 < people.length; i += 2) {
    const [a, b] = [people[i]!, people[i + 1]!];
    a.friend = b.username;
    b.friend = a.username;
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await prisma.friendship.create({
      data: {
        userLowId: low,
        userHighId: high,
        requesterId: a.id,
        status: 'ACCEPTED',
        acceptedAt: monthAgo,
      },
    });
  }
  for (const p of people) if (!p.friend) p.friend = people[0]!.username;

  // Two open polls (one yes/no, one multiple choice) and a dozen city topics.
  const { createPoll } = await import('../../src/server/polls');
  const opensAt = new Date(Date.now() - 60_000).toISOString();
  const closesAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
  await createPoll(people[0]!.id, {
    kind: 'yes_no',
    includeUnsure: true,
    topic: 'other',
    question: `Stress test poll ${RUN}: should the Riverwalk get more benches?`,
    opensAt,
    closesAt,
  });
  await createPoll(people[0]!.id, {
    kind: 'single',
    choices: ['Coffee', 'Tea', 'Neither'],
    topic: 'other',
    question: `Stress test poll ${RUN}: what gets you going in the morning?`,
    opensAt,
    closesAt,
  });
  const rows = await pgc.query<{ id: string; choices: string[] }>(
    `SELECT p.id, array_agg(c.id ORDER BY c."position") AS choices
       FROM "Poll" p JOIN "PollChoice" c ON c."pollId" = p.id
      WHERE p."closesAt" > now() AND p."opensAt" <= now() GROUP BY p.id`,
  );
  polls = rows.rows.map((r) => ({ id: r.id, choiceIds: r.choices }));

  return people;
}

async function makeTopics(people: Person[]) {
  for (let i = 0; i < 12; i++) {
    const p = people[i]!;
    const r = await call('createTopic', p, 'POST', '/api/v1/topics', {
      reading: reading(p),
      scope: 'city',
      title: `Stress topic ${RUN} number ${i + 1}`,
      category: 'other',
    });
    const id = (r.json as { topic?: { id: string } } | null)?.topic?.id;
    if (id) topicIds.push(id);
  }
}

// ── The test server ──
async function startServer(): Promise<ChildProcess | null> {
  if (process.env.STRESS_URL) return null;
  const child = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    shell: true,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: url,
      S3_BUCKET_MEDIA: MEDIA_BUCKET,
      S3_BUCKET_QUARANTINE: QUARANTINE_BUCKET,
    },
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/v1/health`)).ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error('The test server did not start (run `npm run build -w @jax/server` first)');
}

function stopServer(child: ChildProcess | null) {
  if (!child?.pid) return;
  // On Windows the server runs under a shell; end the whole tree.
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill();
}

async function bucketBytes(bucket: string) {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
  });
  let bytes = 0;
  let objects = 0;
  let token: string | undefined;
  try {
    do {
      const r = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
      );
      for (const o of r.Contents ?? []) {
        bytes += o.Size ?? 0;
        objects++;
      }
      token = r.NextContinuationToken;
    } while (token);
  } catch {
    // the bucket doesn't exist yet (first run, before any upload)
  }
  return { bytes, objects };
}

// ── Report ──
const pct = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};
const mb = (b: number) => `${(b / 1_048_576).toFixed(1)} MB`;
const ms = (n: number) => `${Math.round(n)}`;

async function tableSizes(pgc: pg.Client) {
  const r = await pgc.query<{ name: string; bytes: string; rows: string }>(
    `SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes, c.reltuples::bigint AS rows
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  );
  return new Map(r.rows.map((x) => [x.name, Number(x.bytes)]));
}

async function main() {
  const pgc = new pg.Client({ connectionString: url });
  await pgc.connect();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  Object.assign(globalThis, { prisma, prismaClass: PrismaClient }); // the server code reuses it

  console.log(`Setting up ${PEOPLE} people in ${dbName} (run ${RUN})…`);
  const people = await setUp(prisma, pgc);
  photos = await makePhotos();
  const server = await startServer();
  try {
    await makeTopics(people);

    // The day's work, shuffled so writes and reads overlap the way they do in real use.
    const plan: Action[] = [];
    for (const [action, per] of Object.entries(PER_PERSON) as [Action, number][]) {
      for (let i = 0, n = Math.round(per * PEOPLE); i < n; i++) plan.push(action);
    }
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [plan[i], plan[j]] = [plan[j]!, plan[i]!];
    }
    // Some posts first (not counted), so there is something to read, vote on and comment on.
    recording = new Map();
    const warm = Array.from({ length: Math.min(200, Math.round(PEOPLE / 5)) }, () => {
      const p = pick(people)!;
      return () => (Math.random() < 0.3 ? ACTIONS.postPhotos(p) : ACTIONS.postText(p));
    });
    await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        for (let job = warm.pop(); job; job = warm.pop()) await job();
      }),
    );
    // Then the quiet baseline: each action alone, so the report can show how much of the time
    // under load is waiting in line.
    recording = quiet;
    for (const action of QUIET_ACTIONS) {
      for (let i = 0; i < 15; i++) await ACTIONS[action](pick(people)!);
    }
    recording = stats;
    // Sizes from here on are the measured day only (not the warm-up posts).
    await pgc.query('ANALYZE');
    const dbBefore = Number(
      (await pgc.query('SELECT pg_database_size(current_database()) n')).rows[0].n,
    );
    const tablesBefore = await tableSizes(pgc);
    const mediaBefore = await bucketBytes(MEDIA_BUCKET);

    console.log(`Playing ${plan.length.toLocaleString()} actions with ${WORKERS} at a time…`);
    const started = performance.now();
    let next = 0;
    let done = 0;
    const tick = setInterval(() => {
      const s = (performance.now() - started) / 1000;
      console.log(
        `  ${done.toLocaleString()} / ${plan.length.toLocaleString()}  (${(done / s).toFixed(0)}/s)`,
      );
    }, 15_000);
    await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        while (next < plan.length) {
          const action = plan[next++]!;
          await ACTIONS[action](pick(people)!);
          done++;
        }
      }),
    );
    clearInterval(tick);
    const seconds = (performance.now() - started) / 1000;

    await pgc.query('ANALYZE');
    const dbAfter = Number(
      (await pgc.query('SELECT pg_database_size(current_database()) n')).rows[0].n,
    );
    const tablesAfter = await tableSizes(pgc);
    const mediaAfter = await bucketBytes(MEDIA_BUCKET);
    const quarantine = await bucketBytes(QUARANTINE_BUCKET);

    const requests = [...stats.values()].reduce((n, s) => n + s.ms.length, 0);
    const errors = [...stats.values()].reduce(
      (n, s) => n + [...s.errors.values()].reduce((a, b) => a + b, 0),
      0,
    );
    const rate = requests / seconds;
    const neededPeak = (requests * PEAK_HOUR_SHARE) / 3600;
    const rows = [...stats.entries()].sort((a, b) => b[1].ms.length - a[1].ms.length);
    const growth = [...tablesAfter.entries()]
      .map(([t, b]) => [t, b - (tablesBefore.get(t) ?? 0)] as const)
      .filter(([, d]) => d > 64 * 1024)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    const up = [...stats.values()].reduce((n, s) => n + s.up, 0);
    const down = [...stats.values()].reduce((n, s) => n + s.down, 0);
    // Rate-limit counters only last their window and are deleted nightly (D8), so they don't
    // add up from day to day; the lasting growth leaves them out.
    const counters =
      (tablesAfter.get('RateLimitCounter') ?? 0) - (tablesBefore.get('RateLimitCounter') ?? 0);
    const dbDay = dbAfter - dbBefore - counters;
    const mediaDay = mediaAfter.bytes - mediaBefore.bytes;

    const lines = [
      '# Daily-volume stress test (P15.12)',
      '',
      `Generated by \`npm run load:daily -w @jax/server\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      `against \`${dbName}\` on this development PC (the server in production mode, Postgres and`,
      'S3 storage in Docker on the same machine). A Lightsail 2 GB server has fewer, slower cores,',
      'so treat the speed as a best case and the sizes as exact.',
      '',
      `**The day:** ${PEOPLE.toLocaleString()} active people, ${requests.toLocaleString()} requests (${plan.filter((a) => WRITES.has(a)).length.toLocaleString()} of them writes), played in ${(seconds / 60).toFixed(1)} minutes with ${WORKERS} at a time.`,
      '',
      '## Can it keep up?',
      '',
      `- Handled **${rate.toFixed(0)} requests a second**. The busiest hour of such a day needs about **${neededPeak.toFixed(1)} a second** (${PEAK_HOUR_SHARE * 100}% of the day in one hour): **${(rate / neededPeak).toFixed(0)}× headroom** on this PC.`,
      `- Errors: **${errors.toLocaleString()}** of ${requests.toLocaleString()} (${((errors / requests) * 100).toFixed(2)}%).`,
      '',
      '## Response times (ms)',
      '',
      '"Alone" is the median with nothing else running; the rest are under the full load.',
      '',
      '| Action | Requests | Alone | Median | 95% | 99% | Slowest | Errors |',
      '| ------ | -------: | ----: | -----: | --: | --: | ------: | ------ |',
      ...rows.map(
        ([name, s]) =>
          `| ${name} | ${s.ms.length.toLocaleString()} | ${quiet.has(name) ? ms(pct(quiet.get(name)!.ms, 0.5)) : ''} | ${ms(pct(s.ms, 0.5))} | ${ms(pct(s.ms, 0.95))} | ${ms(pct(s.ms, 0.99))} | ${ms(Math.max(0, ...s.ms))} | ${[...s.errors.entries()].map(([k, v]) => `${k} ×${v}`).join(', ') || '—'} |`,
      ),
      '',
      '## Growth per day like this',
      '',
      `- **Database:** +${mb(dbDay)} that lasts (about ${mb(dbDay * 30)} a month, ${((dbDay * 365) / 1_073_741_824).toFixed(1)} GB a year before the retention jobs remove old data), plus ${mb(counters)} of rate-limit counters that the nightly job deletes.`,
      `- **Photo / voice / video storage:** +${mb(mediaDay)} in ${(mediaAfter.objects - mediaBefore.objects).toLocaleString()} files (about ${((mediaDay * 30) / 1_073_741_824).toFixed(1)} GB a month). Waiting in quarantine at the end: ${quarantine.objects}.`,
      `- **Bandwidth:** ${mb(up)} uploaded, ${mb(down)} downloaded (about ${((down * 30) / 1_073_741_824).toFixed(0)} GB a month out of the server; Lightsail's 2 GB plan includes 3 TB).`,
      '',
      '| Table (incl. indexes) | Growth |',
      '| --------------------- | -----: |',
      ...growth.map(([t, d]) => `| ${t} | ${mb(d)} |`),
      '',
    ];
    const out = path.resolve(import.meta.dirname, '../../../../docs/STRESS_TEST_RESULTS.md');
    writeFileSync(out, lines.join('\n'));
    console.log(lines.slice(9, 14).join('\n'));
    console.log(`\nWrote ${out}`);
  } finally {
    stopServer(server);
    await prisma.$disconnect();
    await pgc.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
