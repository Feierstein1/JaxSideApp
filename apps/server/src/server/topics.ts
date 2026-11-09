import {
  APP_TIME_ZONE,
  milesToMeters,
  TOPIC_CATEGORIES,
  type AdminTopicRequest,
  type CreateTopicRequest,
  type MyTopicSuggestion,
  type SuggestTopicRequest,
  type TopicCategory,
  type TopicListRequest,
  type TopicPage,
  type TopicView,
} from '@jax/shared';
import type { CityTopic, User } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { skipsAccountWaits } from './account-age';
import { getConfig, invalidateConfigCache } from './config';
import { db } from './db';
import { decodeCursor, encodeCursor } from './discussions/cursor';
import { ApiError } from './http';
import type { GeoPoint } from './location/eligibility';
import { holdFor, holdReport, screenText } from './moderation/screening';
import { pageWindow, toPage } from './admin/paging';

/**
 * Topics (D125, D133). A topic is an area for posts: posts in it are general posts with
 * topicId set (see discussions/posts.ts). Two kinds:
 * - CITY: for all of Duval (anyone inside the county can read and post).
 * - LOCAL: tied to the (coarsened) spot where it was made; seen and posted in only within
 *   topics.localRadiusMiles of it.
 * A topic is "open" while it's ACTIVE, has started (opensAt) and hasn't ended (closesAt); a
 * CLOSED topic, or one past its end, is read-only. REMOVED ones (moderation) are hidden.
 * Anyone with a confirmed account can create one (D133); they're screened like posts and
 * can be reported.
 */

/** SQL: the topic `t` is open now. */
export const topicOpenSql = (t: Prisma.Sql) => Prisma.sql`(${t}.status = 'ACTIVE'
  AND ${t}."opensAt" <= now() AND (${t}."closesAt" IS NULL OR ${t}."closesAt" > now()))`;

/** SQL: the topic `t` is one people can see (started; not a suggestion, rejected or removed). */
const visibleSql = (t: Prisma.Sql) =>
  Prisma.sql`${t}.status IN ('ACTIVE', 'CLOSED') AND ${t}."opensAt" <= now()`;

export function isTopicOpen(
  t: Pick<CityTopic, 'status' | 'opensAt' | 'closesAt'>,
  now = new Date(),
) {
  return t.status === 'ACTIVE' && t.opensAt <= now && (!t.closesAt || t.closesAt > now);
}

/** D131: a stored category, or "other" if the list changed. */
const asCategory = (c: string): TopicCategory =>
  c in TOPIC_CATEGORIES ? (c as TopicCategory) : 'other';

const point = (p: GeoPoint) =>
  Prisma.sql`ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography`;

export const localRadiusMeters = async () =>
  milesToMeters(await getConfig('topics.localRadiusMiles'));

type TopicRow = {
  id: string;
  scope: 'CITY' | 'LOCAL';
  title: string;
  category: string;
  description: string | null;
  pinned: boolean;
  status: string;
  opensAt: Date;
  closesAt: Date | null;
  createdAt: Date;
  open: boolean;
  post_count: number;
  last_post_at: Date | null;
  follower_count: number;
  following: boolean;
  is_mine: boolean;
  show_creator: boolean;
  creator_name: string | null;
};

const toView = (r: TopicRow): TopicView => ({
  id: r.id,
  scope: r.scope === 'LOCAL' ? 'local' : 'city',
  title: r.title,
  category: asCategory(r.category),
  description: r.description,
  pinned: r.pinned,
  status: r.open ? 'open' : 'closed',
  opensAt: r.opensAt.toISOString(),
  closesAt: r.closesAt?.toISOString() ?? null,
  postCount: r.post_count,
  lastPostAt: r.last_post_at?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  followerCount: r.follower_count,
  following: r.following,
  isMine: r.is_mine,
  // D134: the creator's name only if they chose to show it (and their account is active).
  creator: r.show_creator ? r.creator_name : null,
  ...(r.is_mine ? { showCreator: r.show_creator } : {}),
});

/** `viewerId` may be a guest's placeholder ID (it never matches a user). */
function selectTopics(viewerId: string, where: Prisma.Sql, tail: Prisma.Sql = Prisma.empty) {
  return db.$queryRaw<TopicRow[]>`
    SELECT t.id, t.scope::text AS scope, t.title, t.category, t.description, t.pinned,
           t.status::text, t."opensAt", t."closesAt", t."createdAt",
           ${topicOpenSql(Prisma.sql`t`)} AS open,
           (SELECT count(*)::int FROM "GeneralPost" p
             WHERE p."topicId" = t.id AND p.status = 'VISIBLE') AS post_count,
           (SELECT max(p."createdAt") FROM "GeneralPost" p
             WHERE p."topicId" = t.id AND p.status = 'VISIBLE') AS last_post_at,
           (SELECT count(*)::int FROM "TopicFollow" f WHERE f."topicId" = t.id) AS follower_count,
           EXISTS (SELECT 1 FROM "TopicFollow" f
                   WHERE f."topicId" = t.id AND f."userId" = ${viewerId}::uuid) AS following,
           (t."createdById" = ${viewerId}::uuid) IS TRUE AS is_mine,
           t."showCreator" AS show_creator,
           (SELECT u.username FROM "User" u
             WHERE u.id = t."createdById" AND u.status = 'ACTIVE') AS creator_name
    FROM "CityTopic" t
    WHERE ${where}
    ${tail}`;
}

/**
 * D133: one page of topics of one kind, newest or oldest first (by when they were made),
 * filtered by words, category, the ones you follow, or open only. Local topics: only those
 * within the local radius of `at`.
 */
export async function listTopicPage(
  viewerId: string,
  at: GeoPoint,
  input: Omit<TopicListRequest, 'reading'> & { limit: number },
): Promise<TopicPage> {
  const filters: Prisma.Sql[] = [
    visibleSql(Prisma.sql`t`),
    Prisma.sql`t.scope = ${input.scope === 'local' ? 'LOCAL' : 'CITY'}::"TopicScope"`,
  ];
  if (input.scope === 'local') {
    filters.push(Prisma.sql`ST_DWithin(t.location, ${point(at)}, ${await localRadiusMeters()})`);
  }
  if (input.q) {
    const like = '%' + input.q.replace(/[\\%_]/g, (c) => `\\${c}`) + '%';
    filters.push(Prisma.sql`(t.title ILIKE ${like} OR t.description ILIKE ${like})`);
  }
  if (input.category) filters.push(Prisma.sql`t.category = ${input.category}`);
  if (input.following) {
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "TopicFollow" f
      WHERE f."topicId" = t.id AND f."userId" = ${viewerId}::uuid)`);
  }
  if (input.openOnly) filters.push(topicOpenSql(Prisma.sql`t`));
  if (input.mine) filters.push(Prisma.sql`t."createdById" = ${viewerId}::uuid`);
  const newest = input.sort !== 'oldest';
  const c = decodeCursor(input.cursor);
  if (c && 't' in c) {
    filters.push(
      newest
        ? Prisma.sql`(t."createdAt", t.id) < (${new Date(c.t)}::timestamptz, ${c.id}::uuid)`
        : Prisma.sql`(t."createdAt", t.id) > (${new Date(c.t)}::timestamptz, ${c.id}::uuid)`,
    );
  }
  const order = newest
    ? Prisma.sql`ORDER BY t."createdAt" DESC, t.id DESC`
    : Prisma.sql`ORDER BY t."createdAt" ASC, t.id ASC`;
  const rows = await selectTopics(
    viewerId,
    Prisma.join(filters, ' AND '),
    Prisma.sql`${order} LIMIT ${input.limit + 1}`,
  );
  const more = rows.length > input.limit;
  const items = rows.slice(0, input.limit);
  const last = items[items.length - 1];
  return {
    topics: items.map(toView),
    nextCursor:
      more && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null,
  };
}

/**
 * The open topics of every kind (no location filter): the admin and old city lists. Local
 * topics are left out; they're listed by place with listTopicPage.
 */
export async function listTopics(viewerId: string, closedLimit = 20) {
  const rows = await selectTopics(
    viewerId,
    Prisma.sql`${visibleSql(Prisma.sql`t`)} AND t.scope = 'CITY'`,
  );
  const open = rows
    .filter((r) => r.open)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (b.last_post_at?.getTime() ?? b.opensAt.getTime()) -
          (a.last_post_at?.getTime() ?? a.opensAt.getTime()),
    );
  const closed = rows
    .filter((r) => !r.open)
    .sort((a, b) => (b.closesAt ?? b.opensAt).getTime() - (a.closesAt ?? a.opensAt).getTime())
    .slice(0, closedLimit);
  return { open: open.map(toView), closed: closed.map(toView) };
}

/** Where a topic is and whether it's open (for location checks on its posts). */
export async function topicAnchor(id: string) {
  const [row] = await db.$queryRaw<
    {
      scope: 'CITY' | 'LOCAL';
      latitude: number | null;
      longitude: number | null;
      open: boolean;
      visible: boolean;
    }[]
  >`
    SELECT scope::text AS scope, ST_Y(location::geometry) AS latitude,
           ST_X(location::geometry) AS longitude, ${topicOpenSql(Prisma.sql`t`)} AS open,
           ${visibleSql(Prisma.sql`t`)} AS visible
    FROM "CityTopic" t WHERE id = ${id}::uuid`;
  if (!row || !row.visible) throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
  return {
    open: row.open,
    /** D133: a local topic's spot (posts and reads must be within the local radius). */
    local:
      row.scope === 'LOCAL' && row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null,
  };
}

/** One topic people can see (it has started and isn't a suggestion, rejected or removed). */
export async function getTopic(id: string, viewerId: string): Promise<TopicView> {
  const [row] = await selectTopics(
    viewerId,
    Prisma.sql`t.id = ${id}::uuid AND ${visibleSql(Prisma.sql`t`)}`,
  );
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
  return toView(row);
}

/** Before posting into a topic: it exists and is open. */
export async function assertTopicOpen(id: string) {
  const t = await topicAnchor(id);
  if (!t.open) throw new ApiError(409, 'TOPIC_CLOSED', 'This topic is closed to new posts.');
  return t;
}

/**
 * D133: create a topic. Title and description are screened like posts (a blocked or held
 * word refuses it; a warning needs confirmWarning). A local topic is placed at `at`
 * (already coarsened by the caller).
 */
export async function createUserTopic(
  userId: string,
  input: CreateTopicRequest,
  at: GeoPoint,
  opts: { staff?: boolean } = {},
): Promise<{ id: string; held: boolean; pending: boolean }> {
  // D142: screened like a new post: a hold rule (spam, scams, borderline words) saves the
  // topic hidden for a moderator instead of refusing it.
  const screen = await screenText(`${input.title}\n${input.description ?? ''}`, 'new-content', {
    confirmWarning: input.confirmWarning,
  });
  // D222: while approval is required, a topic waits for an admin (the Topics page, "Suggestions
  // waiting") and shows in the creator's "My suggestions". Staff are never held.
  const pending = !screen.held && !opts.staff && (await topicApprovalRequired());
  const status = screen.held ? 'HELD' : pending ? 'SUGGESTED' : 'ACTIVE';
  const [row] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "CityTopic" (id, scope, title, category, description, location, status,
                             "createdById", "suggestedById", "showCreator", "updatedAt")
    VALUES (uuid_v7(), ${input.scope === 'local' ? 'LOCAL' : 'CITY'}::"TopicScope",
            ${input.title}, ${input.category ?? 'other'}, ${input.description ?? null},
            ${input.scope === 'local' ? point(at) : null}, ${status}::"CityTopicStatus",
            ${userId}::uuid, ${pending ? userId : null}::uuid, ${input.showCreator ?? false}, now())
    RETURNING id`;
  if (screen.held) await holdReport(holdFor(screen.rule), { cityTopicId: row!.id });
  return { id: row!.id, held: screen.held, pending };
}

/** D222: do topics that people start wait for an admin to approve them? */
export async function topicApprovalRequired() {
  return (await getConfig('topics.requireApproval')) === 1;
}

/** D222: the admin's switch ("Make topics admin approved" / "Remove admin approval"). */
export async function setTopicApprovalRequired(required: boolean) {
  await db.appConfiguration.upsert({
    where: { key: 'topics.requireApproval' },
    create: { key: 'topics.requireApproval', value: required ? 1 : 0 },
    update: { value: required ? 1 : 0 },
  });
  invalidateConfigCache();
}

/**
 * D143: one new topic of each kind (City, Near me) every topics.newEveryDays per person.
 * Every topic they started counts, deleted, held or removed ones too, so deleting one doesn't
 * free the slot. D147: and only once the account is topics.createMinAccountDays old (slows
 * down new accounts made to advertise). Admins aren't limited.
 */
export async function assertTopicAllowance(
  user: Pick<User, 'id' | 'role' | 'staffBadge' | 'createdAt'>,
  scope: 'city' | 'local',
  now = new Date(),
) {
  if (skipsAccountWaits(user)) return; // D162
  const minAge = await getConfig('topics.createMinAccountDays');
  const allowedAt = new Date(user.createdAt.getTime() + minAge * 86_400_000);
  if (now < allowedAt) {
    const when = allowedAt.toLocaleDateString('en-US', {
      timeZone: APP_TIME_ZONE,
      month: 'short',
      day: 'numeric',
    });
    throw new ApiError(
      403,
      'ACCOUNT_TOO_NEW',
      `New accounts can start topics after ${minAge} days (from ${when}). You can post in existing topics now.`,
    );
  }
  const days = await getConfig('topics.newEveryDays');
  const last = await db.cityTopic.findFirst({
    where: {
      createdById: user.id,
      scope: scope === 'local' ? 'LOCAL' : 'CITY',
      createdAt: { gt: new Date(now.getTime() - days * 86_400_000) },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!last) return;
  const next = new Date(last.createdAt.getTime() + days * 86_400_000);
  const when = next.toLocaleDateString('en-US', {
    timeZone: APP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  });
  throw new ApiError(
    429,
    'TOPIC_LIMIT',
    `You can start one ${scope === 'local' ? 'Near me' : 'City'} topic every ${days} days. Your next one: ${when}.`,
    { next: next.toISOString() },
  );
}

/** D134: a topic you started that people can still see (not removed, held or deleted). */
async function ownTopic(userId: string, id: string) {
  const t = await db.cityTopic.findFirst({
    where: { id, createdById: userId, status: { in: ['ACTIVE', 'CLOSED'] } },
    select: { id: true },
  });
  // Someone else's topic looks the same as a missing one (no hint it exists).
  if (!t) throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
}

/** D134: the only change a creator can make: show or hide their username. */
export async function setShowCreator(userId: string, id: string, show: boolean) {
  await ownTopic(userId, id);
  await db.cityTopic.update({ where: { id }, data: { showCreator: show } });
}

/**
 * D134: the creator deletes their topic. It's hidden at once for everyone; the admin sees it
 * as "Deleted by creator" for topics.deletedKeepDays, then purgeDeletedTopics removes it.
 */
export async function deleteOwnTopic(userId: string, id: string, now = new Date()) {
  await ownTopic(userId, id);
  await db.cityTopic.update({ where: { id }, data: { status: 'DELETED', deletedAt: now } });
}

/**
 * D134 (nightly): topics deleted by their creator more than topics.deletedKeepDays ago are
 * removed. Their posts are marked deleted (and leave the topic), so the normal retention job
 * removes them with their comments, votes and media; follows and reports go with the topic.
 */
export async function purgeDeletedTopics(now = new Date()): Promise<number> {
  const days = await getConfig('topics.deletedKeepDays');
  const before = new Date(now.getTime() - days * 86_400_000);
  const due = await db.cityTopic.findMany({
    where: { status: 'DELETED', deletedAt: { lt: before } },
    select: { id: true },
    take: 500,
  });
  if (!due.length) return 0;
  const ids = due.map((t) => t.id);
  await db.$transaction([
    db.generalPost.updateMany({
      where: { topicId: { in: ids }, status: { not: 'DELETED' } },
      data: { status: 'DELETED' },
    }),
    db.generalPost.updateMany({ where: { topicId: { in: ids } }, data: { topicId: null } }),
    db.cityTopic.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return ids.length;
}

/** D133: follow or unfollow (idempotent). */
export async function setFollow(userId: string, topicId: string, follow: boolean) {
  await topicAnchor(topicId); // 404 for unknown, hidden or removed topics
  if (follow) {
    await db.topicFollow.createMany({ data: [{ userId, topicId }], skipDuplicates: true });
  } else {
    await db.topicFollow.deleteMany({ where: { userId, topicId } });
  }
  return { following: follow, followerCount: await db.topicFollow.count({ where: { topicId } }) };
}

/** D133: moderation: hide a topic (and with it, its posts from lists) or bring it back. */
export async function setTopicRemoved(id: string, removed: boolean) {
  const t = await db.cityTopic.findUnique({ where: { id }, select: { status: true } });
  if (!t) throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
  await db.cityTopic.update({ where: { id }, data: { status: removed ? 'REMOVED' : 'ACTIVE' } });
}

// ─────────────────────────────── Suggestions ───────────────────────────────

export async function suggestTopic(userId: string, input: SuggestTopicRequest) {
  const t = await db.cityTopic.create({
    data: {
      title: input.title,
      category: input.category,
      description: input.description ?? null,
      status: 'SUGGESTED',
      suggestedById: userId,
    },
  });
  return t.id;
}

/** Your suggestions, newest first, with what happened to each. */
export async function mySuggestions(userId: string): Promise<MyTopicSuggestion[]> {
  const rows = await db.cityTopic.findMany({
    where: { suggestedById: userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    status:
      t.status === 'SUGGESTED' ? 'waiting' : t.status === 'REJECTED' ? 'rejected' : 'approved',
    reason: t.status === 'REJECTED' ? t.decisionReason : null,
    createdAt: t.createdAt.toISOString(),
  }));
}

// ─────────────────────────────── Admin ───────────────────────────────

/**
 * Admin list: topics in the given statuses (or one topic by ID), newest first, with their
 * posts count; 20 a page (D210).
 */
export async function adminListTopics(opts: {
  statuses?: CityTopic['status'][];
  id?: string;
  page?: number;
}) {
  const page = opts.page ?? 1;
  const where: Prisma.CityTopicWhereInput = {
    ...(opts.statuses ? { status: { in: opts.statuses } } : {}),
    ...(opts.id ? { id: opts.id } : {}),
  };
  const [rows, total] = await Promise.all([
    db.cityTopic.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(page),
      include: {
        suggestedBy: { select: { id: true, username: true } },
        createdBy: { select: { username: true } },
        _count: { select: { posts: { where: { status: 'VISIBLE' } } } },
      },
    }),
    db.cityTopic.count({ where }),
  ]);
  const now = new Date();
  const list = rows.map((t) => ({
    id: t.id,
    title: t.title,
    category: asCategory(t.category),
    scope: t.scope === 'LOCAL' ? ('local' as const) : ('city' as const),
    description: t.description,
    status: t.status,
    open: isTopicOpen(t, now),
    pinned: t.pinned,
    opensAt: t.opensAt.toISOString(),
    closesAt: t.closesAt?.toISOString() ?? null,
    suggestedBy: t.suggestedBy,
    createdBy: t.createdBy?.username ?? null,
    decisionReason: t.decisionReason,
    deletedAt: t.deletedAt?.toISOString() ?? null,
    showCreator: t.showCreator,
    createdAt: t.createdAt.toISOString(),
    posts: t._count.posts,
  }));
  return toPage(list, total, page);
}

const dates = (input: AdminTopicRequest) => ({
  ...(input.opensAt ? { opensAt: new Date(input.opensAt) } : {}),
  closesAt: input.closesAt ? new Date(input.closesAt) : null,
});

export async function createTopic(adminId: string, input: AdminTopicRequest) {
  const t = await db.cityTopic.create({
    data: {
      title: input.title,
      category: input.category,
      description: input.description ?? null,
      pinned: input.pinned,
      status: 'ACTIVE',
      createdById: adminId,
      ...dates(input),
    },
  });
  return t.id;
}

async function topicOr404(id: string) {
  const t = await db.cityTopic.findUnique({ where: { id } });
  if (!t) throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
  return t;
}

export async function updateTopic(id: string, input: AdminTopicRequest) {
  const t = await topicOr404(id);
  if (t.status === 'SUGGESTED' || t.status === 'REJECTED') {
    throw new ApiError(409, 'NOT_A_TOPIC', 'Approve the suggestion first.');
  }
  await db.cityTopic.update({
    where: { id },
    data: {
      title: input.title,
      category: input.category,
      description: input.description ?? null,
      pinned: input.pinned,
      ...dates(input),
    },
  });
}

/** Approve (optionally reworded) or reject a suggestion; close or reopen a topic. */
export async function decideTopic(
  id: string,
  d:
    | { action: 'approve'; title?: string; description?: string; category?: TopicCategory }
    | { action: 'reject'; reason: string }
    | { action: 'close' }
    | { action: 'reopen' },
  now = new Date(),
) {
  const t = await topicOr404(id);
  if (d.action === 'approve' || d.action === 'reject') {
    // Claim the suggestion so two admins can't both decide it.
    const claimed = await db.cityTopic.updateMany({
      where: { id, status: 'SUGGESTED' },
      data:
        d.action === 'approve'
          ? {
              status: 'ACTIVE',
              decidedAt: now,
              // opensAt stays the suggestion's own time (set by the database when it was
              // made): "now" from this server's clock could be a moment ahead of the
              // database's and hide the topic briefly.
              ...(d.title ? { title: d.title } : {}),
              ...(d.category ? { category: d.category } : {}),
              ...(d.description ? { description: d.description } : {}),
            }
          : { status: 'REJECTED', decidedAt: now, decisionReason: d.reason },
    });
    if (claimed.count !== 1) throw new ApiError(409, 'ALREADY_DECIDED', 'Already decided');
    return;
  }
  if (t.status !== 'ACTIVE' && t.status !== 'CLOSED') {
    throw new ApiError(409, 'NOT_A_TOPIC', 'Approve the suggestion first.');
  }
  await db.cityTopic.update({
    where: { id },
    data:
      d.action === 'close'
        ? { status: 'CLOSED' }
        : // Reopening also clears an end time that has passed.
          { status: 'ACTIVE', ...(t.closesAt && t.closesAt <= now ? { closesAt: null } : {}) },
  });
}
