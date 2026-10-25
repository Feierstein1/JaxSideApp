import type {
  AdminTopicRequest,
  MyTopicSuggestion,
  SuggestTopicRequest,
  TopicView,
} from '@jax/shared';
import type { CityTopic } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import { ApiError } from './http';

/**
 * D125: citywide discussion topics. A topic is "open" while it's ACTIVE, has started
 * (opensAt) and hasn't ended (closesAt); a CLOSED topic, or one past its end, is read-only.
 * Posts in a topic are general posts with topicId set (see discussions/posts.ts).
 */

/** SQL: the topic `t` is open now. */
export const topicOpenSql = (t: Prisma.Sql) => Prisma.sql`(${t}.status = 'ACTIVE'
  AND ${t}."opensAt" <= now() AND (${t}."closesAt" IS NULL OR ${t}."closesAt" > now()))`;

export function isTopicOpen(
  t: Pick<CityTopic, 'status' | 'opensAt' | 'closesAt'>,
  now = new Date(),
) {
  return t.status === 'ACTIVE' && t.opensAt <= now && (!t.closesAt || t.closesAt > now);
}

type TopicRow = {
  id: string;
  title: string;
  description: string | null;
  pinned: boolean;
  status: string;
  opensAt: Date;
  closesAt: Date | null;
  open: boolean;
  post_count: number;
  last_post_at: Date | null;
};

const toView = (r: TopicRow): TopicView => ({
  id: r.id,
  title: r.title,
  description: r.description,
  pinned: r.pinned,
  status: r.open ? 'open' : 'closed',
  opensAt: r.opensAt.toISOString(),
  closesAt: r.closesAt?.toISOString() ?? null,
  postCount: r.post_count,
  lastPostAt: r.last_post_at?.toISOString() ?? null,
});

function selectTopics(where: Prisma.Sql) {
  return db.$queryRaw<TopicRow[]>`
    SELECT t.id, t.title, t.description, t.pinned, t.status::text, t."opensAt", t."closesAt",
           ${topicOpenSql(Prisma.sql`t`)} AS open,
           (SELECT count(*)::int FROM "GeneralPost" p
             WHERE p."topicId" = t.id AND p.status = 'VISIBLE') AS post_count,
           (SELECT max(p."createdAt") FROM "GeneralPost" p
             WHERE p."topicId" = t.id AND p.status = 'VISIBLE') AS last_post_at
    FROM "CityTopic" t
    WHERE ${where}`;
}

/**
 * Open topics (pinned first, then the most recently active) and the closed ones that have
 * started (newest first). Suggestions and rejected ones never show here.
 */
export async function listTopics(closedLimit = 20) {
  const rows = await selectTopics(
    Prisma.sql`t.status IN ('ACTIVE', 'CLOSED') AND t."opensAt" <= now()`,
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

/** One topic people can see (it has started and isn't a suggestion or rejected). */
export async function getTopic(id: string): Promise<TopicView> {
  const [row] = await selectTopics(
    Prisma.sql`t.id = ${id}::uuid AND t.status IN ('ACTIVE', 'CLOSED') AND t."opensAt" <= now()`,
  );
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
  return toView(row);
}

/** Before posting into a topic: it exists and is open. */
export async function assertTopicOpen(id: string, now = new Date()) {
  const t = await db.cityTopic.findUnique({
    where: { id },
    select: { status: true, opensAt: true, closesAt: true },
  });
  if (!t || t.status === 'SUGGESTED' || t.status === 'REJECTED' || t.opensAt > now) {
    throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
  }
  if (!isTopicOpen(t, now)) {
    throw new ApiError(409, 'TOPIC_CLOSED', 'This topic is closed to new posts.');
  }
}

// ─────────────────────────────── Suggestions ───────────────────────────────

export async function suggestTopic(userId: string, input: SuggestTopicRequest) {
  const t = await db.cityTopic.create({
    data: {
      title: input.title,
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

/** Admin list: suggestions waiting, then every topic (with its posts count). */
export async function adminListTopics() {
  const rows = await db.cityTopic.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      suggestedBy: { select: { id: true, username: true } },
      createdBy: { select: { username: true } },
      _count: { select: { posts: { where: { status: 'VISIBLE' } } } },
    },
  });
  const now = new Date();
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    open: isTopicOpen(t, now),
    pinned: t.pinned,
    opensAt: t.opensAt.toISOString(),
    closesAt: t.closesAt?.toISOString() ?? null,
    suggestedBy: t.suggestedBy,
    createdBy: t.createdBy?.username ?? null,
    decisionReason: t.decisionReason,
    createdAt: t.createdAt.toISOString(),
    posts: t._count.posts,
  }));
}

const dates = (input: AdminTopicRequest) => ({
  ...(input.opensAt ? { opensAt: new Date(input.opensAt) } : {}),
  closesAt: input.closesAt ? new Date(input.closesAt) : null,
});

export async function createTopic(adminId: string, input: AdminTopicRequest) {
  const t = await db.cityTopic.create({
    data: {
      title: input.title,
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
    | { action: 'approve'; title?: string; description?: string }
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
              opensAt: now,
              ...(d.title ? { title: d.title } : {}),
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
