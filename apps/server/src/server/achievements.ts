import { Prisma } from '@/generated/prisma/client';
import { db } from './db';

/**
 * P6.7–P6.8 achievements (§13, D64). Definitions live in the `Achievement` table (seeded,
 * editable there); awarding is server-side only and idempotent: the (user, achievement)
 * primary key plus ON CONFLICT DO NOTHING means a medal is earned once. Only registered,
 * active users earn medals; guests never do (they can't post anyway).
 *
 * Criteria are about quality, not volume (§13):
 * - first_visible_content: a post or comment that stayed up for `minAgeHours` (default 24)
 * - net_positive_distinct_posts: at least `minPosts` different posts, each with score ≥
 *   `minScoreEach`
 * - submission_approved: awarded when a suggested place is approved (P5.13)
 */

type Criteria =
  | { type: 'first_visible_content'; minAgeHours?: number }
  | { type: 'net_positive_distinct_posts'; minPosts: number; minScoreEach: number }
  | { type: 'submission_approved' };

/** Awards every rule-based medal that `userId` (or everyone, if omitted) now qualifies for. */
export async function evaluateAchievements(
  now = new Date(),
  userId?: string,
  client: Prisma.TransactionClient = db,
): Promise<number> {
  const defs = await client.achievement.findMany({ where: { active: true } });
  const onlyUser = userId ? Prisma.sql`AND u.id = ${userId}::uuid` : Prisma.empty;
  let awarded = 0;
  for (const def of defs) {
    const c = def.criteria as Criteria;
    if (c.type === 'first_visible_content') {
      const cutoff = new Date(now.getTime() - (c.minAgeHours ?? 24) * 3_600_000);
      awarded += await client.$executeRaw`
        INSERT INTO "UserAchievement" ("userId", "achievementId", "awardedAt")
        SELECT u.id, ${def.id}::uuid, ${now}
        FROM "User" u
        WHERE u.status = 'ACTIVE' ${onlyUser}
          AND (EXISTS (SELECT 1 FROM "GeneralPost" p WHERE p."authorId" = u.id
                         AND p.status = 'VISIBLE' AND p."createdAt" <= ${cutoff})
            OR EXISTS (SELECT 1 FROM "BusinessPost" p WHERE p."authorId" = u.id
                         AND p.status = 'VISIBLE' AND p."createdAt" <= ${cutoff})
            OR EXISTS (SELECT 1 FROM "Comment" c WHERE c."authorUserId" = u.id
                         AND c.status = 'VISIBLE' AND c."createdAt" <= ${cutoff}))
        ON CONFLICT DO NOTHING`;
    } else if (c.type === 'net_positive_distinct_posts') {
      awarded += await client.$executeRaw`
        INSERT INTO "UserAchievement" ("userId", "achievementId", "awardedAt")
        SELECT u.id, ${def.id}::uuid, ${now}
        FROM "User" u
        WHERE u.status = 'ACTIVE' ${onlyUser}
          AND (SELECT count(*) FROM (
                 SELECT id FROM "GeneralPost" p WHERE p."authorId" = u.id
                   AND p.status = 'VISIBLE' AND p.score >= ${c.minScoreEach}
                 UNION ALL
                 SELECT id FROM "BusinessPost" p WHERE p."authorId" = u.id
                   AND p.status = 'VISIBLE' AND p.score >= ${c.minScoreEach}) q) >= ${c.minPosts}
        ON CONFLICT DO NOTHING`;
    }
    // submission_approved is awarded by the approval itself (P5.13).
  }
  return awarded;
}

/** After an upvote: the post's author may now qualify for Well Received. */
export async function evaluateForPostAuthor(kind: 'general' | 'business', postId: string) {
  const post =
    kind === 'general'
      ? await db.generalPost.findUnique({ where: { id: postId }, select: { authorId: true } })
      : await db.businessPost.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (post) await evaluateAchievements(new Date(), post.authorId);
}

/** P6.9: a person's medals for their profile. */
export async function medalsFor(userId: string) {
  const rows = await db.userAchievement.findMany({
    where: { userId, achievement: { active: true } },
    orderBy: { awardedAt: 'asc' },
    include: { achievement: true },
  });
  return rows.map((r) => ({
    key: r.achievement.key,
    name: r.achievement.name,
    description: r.achievement.description,
    icon: r.achievement.icon,
    awardedAt: r.awardedAt.toISOString(),
  }));
}

/** SQL for a post/comment author's medal keys (shown next to their name). */
export const medalKeysSql = (authorColumn: Prisma.Sql) => Prisma.sql`
  COALESCE((SELECT array_agg(a.key ORDER BY a.key)
            FROM "UserAchievement" ua JOIN "Achievement" a ON a.id = ua."achievementId"
            WHERE ua."userId" = ${authorColumn} AND a.active), '{}'::varchar[])`;
