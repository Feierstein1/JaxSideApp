import { db } from '../db';
import { ApiError } from '../http';
import { pageWindow, toPage } from './paging';
import { nextStrikeStep } from './users';

/**
 * Admin → Topics → one topic: its posts, 20 a page, newest first, so an admin can read them and
 * moderate from there (remove with the usual case decision; strike, suspend or ban the author
 * with the usual user actions). Visible posts by default; held and removed ones on their tabs.
 */

export const TOPIC_POST_TABS = ['visible', 'held', 'removed'] as const;
export type TopicPostTab = (typeof TOPIC_POST_TABS)[number];
export const topicPostTab = (raw: unknown): TopicPostTab =>
  TOPIC_POST_TABS.includes(raw as TopicPostTab) ? (raw as TopicPostTab) : 'visible';

/** The ladder step a strike gives now, said like the user page does (null: can't get one). */
function stepLabel(next: Awaited<ReturnType<typeof nextStrikeStep>>) {
  if (!next) return null;
  if (next.action === 'WARN') return 'warning';
  if (next.action === 'BAN') return 'ban';
  return next.hours % 24 === 0 ? `${next.hours / 24} day suspension` : `${next.hours} h suspension`;
}

const STATUS = {
  visible: 'VISIBLE',
  held: 'HELD_FOR_REVIEW',
  removed: 'REMOVED',
} as const satisfies Record<TopicPostTab, string>;

export async function adminTopicPosts(topicId: string, tab: TopicPostTab, page: number) {
  const topic = await db.cityTopic.findUnique({
    where: { id: topicId },
    select: { id: true, title: true, description: true, status: true, createdAt: true },
  });
  if (!topic) throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
  const where = { topicId, status: STATUS[tab] };
  const [posts, total, counts] = await Promise.all([
    db.generalPost.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(page),
      select: {
        id: true,
        body: true,
        status: true,
        score: true,
        commentCount: true,
        createdAt: true,
        editedAt: true,
        author: { select: { id: true, username: true, status: true, role: true } },
        _count: {
          select: {
            reports: { where: { status: 'OPEN' } },
            photos: { where: { status: 'ACTIVE' } },
          },
        },
      },
    }),
    db.generalPost.count({ where }),
    db.generalPost.groupBy({
      by: ['status'],
      where: { topicId, status: { in: Object.values(STATUS) } },
      _count: true,
    }),
  ]);
  // What a strike would do next, once per author on the page (admins can't be sanctioned).
  const authors = [...new Map(posts.map((p) => [p.author.id, p.author])).values()];
  const steps = new Map(
    await Promise.all(
      authors.map(
        async (a) =>
          [
            a.id,
            a.role === 'ADMIN' ? null : stepLabel(await nextStrikeStep(a.id, a.status)),
          ] as const,
      ),
    ),
  );
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  return {
    topic: { ...topic, createdAt: topic.createdAt.toISOString() },
    counts: {
      visible: count(STATUS.visible),
      held: count(STATUS.held),
      removed: count(STATUS.removed),
    },
    posts: toPage(
      posts.map((p) => ({
        id: p.id,
        body: p.body,
        status: p.status,
        score: p.score,
        comments: p.commentCount,
        openReports: p._count.reports,
        media: p._count.photos,
        createdAt: p.createdAt.toISOString(),
        edited: !!p.editedAt,
        author: {
          id: p.author.id,
          username: p.author.username,
          status: p.author.status,
          admin: p.author.role === 'ADMIN',
          step: steps.get(p.author.id) ?? null,
        },
      })),
      total,
      page,
    ),
  };
}
