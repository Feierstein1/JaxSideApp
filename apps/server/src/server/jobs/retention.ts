import { Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { objectStore } from '../media/store';
import { logger } from '../logger';
import { deleteInBatches } from './batch';

/**
 * P13.7 (D107): how long things are kept. Run by the daily maintenance job. The rule that
 * applies to all of it: **nothing is deleted while a report on it is still open.**
 *
 * - Notifications: read ones 7 days after being read; unread ones after 30 days.
 * - Posts and comments: deleted by their author, gone for good after 30 days; removed by a
 *   moderator, kept a year as evidence (moderation actions themselves are kept 3 years).
 *   A comment that still has replies is blanked (a "[deleted]" placeholder) instead of
 *   deleted, so the replies survive; a later run deletes it once it has none. Deleting a post
 *   takes its comments, votes and closed reports with it; its photos become unattached and
 *   the unused-photo purge deletes them, files included.
 * - Unsent messages: the row is deleted a day after unsending (a report keeps its snapshot).
 * - Removed or rejected media: the row and the stored file after 30 days.
 * - Location flags: 3 months. Installations unseen for a year (never banned ones, or ones a
 *   guest session or moderation action still points to). Resolved contact tickets: 2 years.
 */

const DAY_MS = 86_400_000;
/** Rows handled per round, so no single statement gets large. */
const BATCH = 500;

export interface RetentionReport {
  notificationsDeleted: number;
  postsDeleted: number;
  commentsDeleted: number;
  commentsBlanked: number;
  unsentMessagesDeleted: number;
  removedMediaDeleted: number;
  locationFlagsDeleted: number;
  installationsDeleted: number;
  contactMessagesDeleted: number;
  activeDaysDeleted: number;
}

export async function runRetention(now: Date): Promise<RetentionReport> {
  const days = async (key: Parameters<typeof getConfig>[0]) =>
    new Date(now.getTime() - (await getConfig(key)) * DAY_MS);
  const [
    readCut,
    unreadCut,
    deletedCut,
    removedCut,
    unsentCut,
    mediaCut,
    flagCut,
    installCut,
    contactCut,
    activeDayCut,
  ] = await Promise.all([
    days('retention.notificationReadDays'),
    days('retention.notificationUnreadDays'),
    days('retention.deletedContentDays'),
    days('retention.removedContentDays'),
    days('retention.unsentMessageDays'),
    days('retention.removedMediaDays'),
    days('retention.locationFlagDays'),
    days('retention.installationUnseenDays'),
    days('retention.resolvedContactDays'),
    days('retention.activeDayDays'),
  ]);

  const notificationsDeleted = await deleteInBatches(
    'Notification',
    Prisma.sql`("readAt" < ${readCut} OR ("readAt" IS NULL AND "createdAt" < ${unreadCut}))`,
  );
  const postsDeleted =
    (await purgePosts('general', deletedCut, removedCut)) +
    (await purgePosts('business', deletedCut, removedCut));
  const { commentsDeleted, commentsBlanked } = await purgeComments(deletedCut, removedCut);

  return {
    notificationsDeleted,
    postsDeleted,
    commentsDeleted,
    commentsBlanked,
    unsentMessagesDeleted: await purgeUnsentMessages(unsentCut),
    removedMediaDeleted: await purgeRemovedMedia(mediaCut),
    locationFlagsDeleted: (
      await db.locationFlag.deleteMany({ where: { createdAt: { lt: flagCut } } })
    ).count,
    installationsDeleted: (
      await db.installation.deleteMany({
        where: {
          lastSeenAt: { lt: installCut },
          bannedAt: null,
          guestSessions: { none: {} },
          modActions: { none: {} },
        },
      })
    ).count,
    contactMessagesDeleted: (
      await db.contactMessage.deleteMany({
        where: { status: 'RESOLVED', resolvedAt: { lt: contactCut } },
      })
    ).count,
    // D188: giveaway tickets (days someone used the app).
    activeDaysDeleted: (await db.userActiveDay.deleteMany({ where: { day: { lt: activeDayCut } } }))
      .count,
  };
}

/** Author-deleted or moderator-removed content whose time is up. */
const expired = (alias: string, deletedCut: Date, removedCut: Date) => {
  const t = Prisma.raw(alias);
  return Prisma.sql`((${t}.status = 'DELETED' AND ${t}."statusChangedAt" < ${deletedCut})
                  OR (${t}.status = 'REMOVED' AND ${t}."statusChangedAt" < ${removedCut}))`;
};

const openReport = (column: string, id: Prisma.Sql) =>
  Prisma.sql`EXISTS (SELECT 1 FROM "Report" r
                     WHERE r.${Prisma.raw(`"${column}"`)} = ${id} AND r.status = 'OPEN')`;

async function purgePosts(
  kind: 'general' | 'business',
  deletedCut: Date,
  removedCut: Date,
): Promise<number> {
  const table = Prisma.raw(kind === 'general' ? '"GeneralPost"' : '"BusinessPost"');
  const col = kind === 'general' ? 'generalPostId' : 'businessPostId';
  let total = 0;
  for (;;) {
    // Not while the post, or any comment or photo on it, has an open report.
    const n = await db.$executeRaw`
      DELETE FROM ${table} WHERE id IN (
        SELECT p.id FROM ${table} p
        WHERE ${expired('p', deletedCut, removedCut)}
          AND NOT ${openReport(col, Prisma.sql`p.id`)}
          AND NOT EXISTS (SELECT 1 FROM "Comment" c JOIN "Report" r ON r."commentId" = c.id
                          WHERE c.${Prisma.raw(`"${col}"`)} = p.id AND r.status = 'OPEN')
          AND NOT EXISTS (SELECT 1 FROM "Photo" ph JOIN "Report" r ON r."photoId" = ph.id
                          WHERE ph.${Prisma.raw(`"${col}"`)} = p.id AND r.status = 'OPEN')
        LIMIT ${BATCH})`;
    total += n;
    if (n < BATCH) return total;
  }
}

async function purgeComments(deletedCut: Date, removedCut: Date) {
  let commentsDeleted = 0;
  for (;;) {
    // Without replies: delete (votes and closed reports go with it).
    const n = await db.$executeRaw`
      DELETE FROM "Comment" WHERE id IN (
        SELECT c.id FROM "Comment" c
        WHERE ${expired('c', deletedCut, removedCut)}
          AND NOT ${openReport('commentId', Prisma.sql`c.id`)}
          AND NOT EXISTS (SELECT 1 FROM "Comment" x WHERE x."parentCommentId" = c.id)
        LIMIT ${BATCH})`;
    commentsDeleted += n;
    if (n < BATCH) break;
  }
  // With replies: keep the placeholder, drop the text.
  const commentsBlanked = await db.$executeRaw`
    UPDATE "Comment" c SET body = ''
    WHERE ${expired('c', deletedCut, removedCut)} AND c.body <> ''
      AND NOT ${openReport('commentId', Prisma.sql`c.id`)}`;
  return { commentsDeleted, commentsBlanked };
}

async function purgeUnsentMessages(cut: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const n = await db.$executeRaw`
      DELETE FROM "Message" WHERE id IN (
        SELECT m.id FROM "Message" m
        WHERE m."unsentAt" < ${cut} AND NOT ${openReport('messageId', Prisma.sql`m.id`)}
        LIMIT ${BATCH})`;
    total += n;
    if (n < BATCH) return total;
  }
}

async function purgeRemovedMedia(cut: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await db.$queryRaw<
      { id: string; storageKey: string | null; quarantineKey: string | null }[]
    >`
      SELECT ph.id, ph."storageKey", ph."quarantineKey" FROM "Photo" ph
      WHERE ph.status IN ('REMOVED', 'REJECTED')
        AND coalesce(ph."removedAt", ph."processedAt", ph."createdAt") < ${cut}
        AND NOT ${openReport('photoId', Prisma.sql`ph.id`)}
      LIMIT ${BATCH}`;
    for (const r of rows) {
      for (const key of [r.storageKey, r.quarantineKey]) {
        if (key)
          await objectStore()
            .delete(key)
            .catch((err: unknown) => logger.warn({ err, key }, 'media file delete failed'));
      }
    }
    if (rows.length) await db.photo.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    total += rows.length;
    if (rows.length < BATCH) return total;
  }
}
