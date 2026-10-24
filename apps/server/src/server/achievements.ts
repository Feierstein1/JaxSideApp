import { MEDAL_TIER_NAMES, type Medal } from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { db } from './db';

/**
 * Achievements (§13, D64) with levels (D122). Definitions live in the `Achievement` table
 * (seeded, editable there); awarding is server-side only. Each medal has thresholds for
 * Bronze, Silver, Gold and Platinum (`tiers`); a person's level only ever goes up: the
 * (user, achievement) primary key plus ON CONFLICT … WHERE new level > old level. Only
 * registered, active users earn medals; guests never do (they can't post anyway).
 *
 * Criteria reward quality, outcomes and time, never raw volume (§13):
 * - first_visible_content: a post or comment that stayed up for `minAgeHours` (default 24)
 * - net_positive_distinct_posts: different posts, each at score ≥ `minScoreEach`
 * - approved_submissions: suggested places that were approved (P5.13, D94)
 * - helpful_comments: different posts with one of your comments at score ≥ `minScoreEach`
 * - matched_place_votes: place-change votes (D94) that matched the final result
 * - zip_areas_with_good_posts: different ZIP areas (D116) with a post at ≥ `minScoreEach`
 * - good_standing_days: account age in days, while active with no suspension or ban in the
 *   last `cleanDays`
 */

type Criteria = { tiers?: number[]; tierLabels?: string[] } & (
  | { type: 'first_visible_content'; minAgeHours?: number }
  | { type: 'net_positive_distinct_posts'; minScoreEach: number; minPosts?: number }
  | { type: 'approved_submissions' }
  | { type: 'helpful_comments'; minScoreEach: number }
  | { type: 'matched_place_votes' }
  | { type: 'zip_areas_with_good_posts'; minScoreEach: number }
  | { type: 'good_standing_days'; cleanDays?: number }
);

const KNOWN_TYPES = new Set<string | undefined>([
  'first_visible_content',
  'net_positive_distinct_posts',
  'approved_submissions',
  'helpful_comments',
  'matched_place_votes',
  'zip_areas_with_good_posts',
  'good_standing_days',
]);

/** The thresholds, lowest first (an older definition may only have `minPosts`). */
function tiersOf(c: Criteria): number[] {
  if (c.tiers?.length) return [...c.tiers].sort((a, b) => a - b).slice(0, 4);
  if (c.type === 'net_positive_distinct_posts' && c.minPosts) return [c.minPosts];
  return [1];
}

/** SQL for one user's count toward a medal (`u` is the "User" row). */
function countSql(c: Criteria, now: Date): Prisma.Sql {
  switch (c.type) {
    case 'first_visible_content': {
      const cutoff = new Date(now.getTime() - (c.minAgeHours ?? 24) * 3_600_000);
      return Prisma.sql`(CASE WHEN
          EXISTS (SELECT 1 FROM "GeneralPost" p WHERE p."authorId" = u.id
                    AND p.status = 'VISIBLE' AND p."createdAt" <= ${cutoff})
       OR EXISTS (SELECT 1 FROM "BusinessPost" p WHERE p."authorId" = u.id
                    AND p.status = 'VISIBLE' AND p."createdAt" <= ${cutoff})
       OR EXISTS (SELECT 1 FROM "Comment" c WHERE c."authorUserId" = u.id
                    AND c.status = 'VISIBLE' AND c."createdAt" <= ${cutoff})
       THEN 1 ELSE 0 END)`;
    }
    case 'net_positive_distinct_posts':
      return Prisma.sql`(
        (SELECT count(*) FROM "GeneralPost" p WHERE p."authorId" = u.id
           AND p.status = 'VISIBLE' AND p.score >= ${c.minScoreEach})
      + (SELECT count(*) FROM "BusinessPost" p WHERE p."authorId" = u.id
           AND p.status = 'VISIBLE' AND p.score >= ${c.minScoreEach}))`;
    case 'approved_submissions':
      return Prisma.sql`(SELECT count(*) FROM "BusinessSubmission" s
        WHERE s."submitterId" = u.id AND s.status = 'APPROVED')`;
    case 'helpful_comments':
      // Different posts, so several good comments under one post count once.
      return Prisma.sql`(SELECT count(DISTINCT COALESCE(c."generalPostId", c."businessPostId"))
        FROM "Comment" c WHERE c."authorUserId" = u.id
          AND c.status = 'VISIBLE' AND c.score >= ${c.minScoreEach})`;
    case 'matched_place_votes':
      // "It's here" on a suggestion that was added, "Not here" on one that was rejected,
      // "Closed" on a removal that happened, "Still open" on a place that was kept.
      return Prisma.sql`(SELECT count(*) FROM "PlaceChangeVote" v
        LEFT JOIN "BusinessSubmission" s ON s.id = v."submissionId"
        LEFT JOIN "PlaceRemoval" r ON r.id = v."removalId"
        WHERE v."voterId" = u.id
          AND ((s.status = 'APPROVED' AND v.support) OR (s.status = 'REJECTED' AND NOT v.support)
            OR (r.status = 'REMOVED' AND v.support) OR (r.status = 'KEPT' AND NOT v.support)))`;
    case 'zip_areas_with_good_posts':
      return Prisma.sql`(SELECT count(DISTINCT z.zip) FROM (
          SELECT p.location FROM "GeneralPost" p WHERE p."authorId" = u.id
            AND p.status = 'VISIBLE' AND p.score >= ${c.minScoreEach} AND p.location IS NOT NULL
          UNION ALL
          SELECT b.location FROM "BusinessPost" p JOIN "BusinessPlace" b ON b.id = p."placeId"
            WHERE p."authorId" = u.id AND p.status = 'VISIBLE' AND p.score >= ${c.minScoreEach}
              AND b.location IS NOT NULL) g
        JOIN "ZipArea" z ON ST_Covers(z.geom, g.location))`;
    case 'good_standing_days': {
      const since = new Date(now.getTime() - (c.cleanDays ?? 90) * 86_400_000);
      return Prisma.sql`(CASE WHEN
          EXISTS (SELECT 1 FROM "ModerationAction" m WHERE m."targetUserId" = u.id
                    AND m.action IN ('SUSPEND', 'BAN') AND m."createdAt" > ${since})
       OR EXISTS (SELECT 1 FROM "AutoSuspension" a WHERE a."userId" = u.id
                    AND a.status <> 'RESTORED' AND a."createdAt" > ${since})
       THEN 0
       ELSE floor(extract(epoch FROM (${now}::timestamptz - u."createdAt")) / 86400) END)`;
    }
  }
}

/**
 * Awards or raises every medal that `userId` (or everyone, if omitted) now qualifies for.
 * Returns how many medals were newly earned or moved up a level.
 */
export async function evaluateAchievements(
  now = new Date(),
  userId?: string,
  client: Prisma.TransactionClient = db,
): Promise<number> {
  const defs = await client.achievement.findMany({ where: { active: true } });
  const onlyUser = userId ? Prisma.sql`AND u.id = ${userId}::uuid` : Prisma.empty;
  let changed = 0;
  for (const def of defs) {
    const c = def.criteria as Criteria;
    if (!KNOWN_TYPES.has(c?.type)) continue; // an unknown or empty rule awards nothing
    const tiers = tiersOf(c);
    changed += await client.$executeRaw`
      INSERT INTO "UserAchievement" ("userId", "achievementId", "awardedAt", tier, "tierAt")
      SELECT u.id, ${def.id}::uuid, ${now}, k.tier, CASE WHEN k.tier > 1 THEN ${now}::timestamptz END
      FROM "User" u
      CROSS JOIN LATERAL (SELECT ${countSql(c, now)}::int AS n) q
      CROSS JOIN LATERAL (SELECT count(*)::int AS tier FROM unnest(${tiers}::int[]) t WHERE q.n >= t) k
      WHERE u.status = 'ACTIVE' ${onlyUser} AND k.tier > 0
      ON CONFLICT ("userId", "achievementId") DO UPDATE
        SET tier = EXCLUDED.tier, "tierAt" = EXCLUDED."awardedAt"
        WHERE EXCLUDED.tier > "UserAchievement".tier`;
  }
  return changed;
}

/** After an upvote on a post: its author may now qualify for Well Received or Explorer. */
export async function evaluateForPostAuthor(kind: 'general' | 'business', postId: string) {
  const post =
    kind === 'general'
      ? await db.generalPost.findUnique({ where: { id: postId }, select: { authorId: true } })
      : await db.businessPost.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (post) await evaluateAchievements(new Date(), post.authorId);
}

/** After an upvote on a comment: its author may now qualify for Helpful Commenter. */
export async function evaluateForCommentAuthor(commentId: string) {
  const c = await db.comment.findUnique({
    where: { id: commentId },
    select: { authorUserId: true },
  });
  if (c?.authorUserId) await evaluateAchievements(new Date(), c.authorUserId);
}

/** P6.9 / D122: a person's medals for their profile, with the level and what's next. */
export async function medalsFor(userId: string): Promise<Medal[]> {
  const rows = await db.userAchievement.findMany({
    where: { userId, achievement: { active: true } },
    orderBy: [{ tier: 'desc' }, { awardedAt: 'asc' }],
    include: { achievement: true },
  });
  return rows.map((r) => {
    const c = r.achievement.criteria as Criteria;
    const levels = tiersOf(c).length;
    const tier = Math.min(r.tier, levels);
    const nextLabel = c.tierLabels?.[tier];
    return {
      key: r.achievement.key,
      name: r.achievement.name,
      description: r.achievement.description,
      icon: r.achievement.icon,
      tier,
      tierName: MEDAL_TIER_NAMES[tier - 1]!,
      levels,
      next:
        tier < levels && nextLabel ? { tierName: MEDAL_TIER_NAMES[tier]!, needs: nextLabel } : null,
      awardedAt: r.awardedAt.toISOString(),
      tierAt: (r.tierAt ?? r.awardedAt).toISOString(),
    };
  });
}

/** SQL for a post/comment author's medal badges (shown next to their name). */
export const medalKeysSql = (authorColumn: Prisma.Sql) => Prisma.sql`
  COALESCE((SELECT json_agg(json_build_object('key', a.key, 'tier', ua.tier) ORDER BY a.key)
            FROM "UserAchievement" ua JOIN "Achievement" a ON a.id = ua."achievementId"
            WHERE ua."userId" = ${authorColumn} AND a.active), '[]'::json)`;
