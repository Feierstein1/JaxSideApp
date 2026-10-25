import { Prisma } from '@/generated/prisma/client';
import type { MyReport, ReportReason, ReportTarget } from '@jax/shared';
import type { Actor } from './auth/require-actor';
import { getConfig } from './config';
import { db } from './db';
import { ApiError } from './http';
import { autoSuspendConfig, maybeAutoSuspend } from './moderation/auto-suspend';
import { getPublicProfile } from './profiles';
import { messageReportEvidence } from './social/messages';

/**
 * P5.1: user reports. Registered users can report what they can see (guests are
 * view-only, D54), but never their own content. Repeats from the same person on the same item
 * while it's still open are folded into the first report (dedupe). The response is the
 * same either way, so it reveals nothing about other reports.
 */

interface ResolvedTarget {
  key: string;
  data: {
    generalPostId?: string;
    businessPostId?: string;
    commentId?: string;
    photoId?: string;
    /** Profile reports only; content reports reach the author through the content. */
    reportedUserId?: string;
    /** D98: a private message, with its snapshot (evidence). */
    messageId?: string;
    /** D133: a reported topic. */
    cityTopicId?: string;
    messageEvidence?: Prisma.InputJsonValue;
  };
  authorUserId: string | null;
  authorGuestId: string | null;
  business: boolean;
}

const NOT_FOUND = () => new ApiError(404, 'NOT_FOUND', 'Not found');

async function resolveTarget(target: ReportTarget, viewerUserId: string | null) {
  if (target.type === 'user') {
    // Same visibility as viewing the profile: 404 if deleted, banned, or they blocked you.
    const { id } = await getPublicProfile(target.username, viewerUserId);
    return {
      key: `user:${id}`,
      data: { reportedUserId: id },
      authorUserId: id,
      authorGuestId: null,
      business: false,
    } satisfies ResolvedTarget;
  }
  if (target.type === 'general' || target.type === 'business') {
    const post =
      target.type === 'general'
        ? await db.generalPost.findFirst({
            where: { id: target.id, status: 'VISIBLE' },
            select: { authorId: true },
          })
        : await db.businessPost.findFirst({
            where: { id: target.id, status: 'VISIBLE' },
            select: { authorId: true },
          });
    if (!post) throw NOT_FOUND();
    return {
      key: `${target.type}:${target.id}`,
      data: {
        [target.type === 'general' ? 'generalPostId' : 'businessPostId']: target.id,
      },
      authorUserId: post.authorId,
      authorGuestId: null,
      business: target.type === 'business',
    } satisfies ResolvedTarget;
  }
  if (target.type === 'message') {
    // D98: only someone in the chat can report a message; the report keeps a snapshot.
    if (!viewerUserId) throw NOT_FOUND();
    const { authorUserId, evidence } = await messageReportEvidence(viewerUserId, target.id);
    return {
      key: `message:${target.id}`,
      data: { messageId: target.id, messageEvidence: evidence },
      authorUserId,
      authorGuestId: null,
      business: false,
    } satisfies ResolvedTarget;
  }
  if (target.type === 'topic') {
    // D133: a topic's title or description; anyone who can see it can report it.
    const t = await db.cityTopic.findFirst({
      where: { id: target.id, status: { in: ['ACTIVE', 'CLOSED'] } },
      select: { createdById: true },
    });
    if (!t) throw NOT_FOUND();
    return {
      key: `topic:${target.id}`,
      data: { cityTopicId: target.id },
      authorUserId: t.createdById,
      authorGuestId: null,
      business: false,
    } satisfies ResolvedTarget;
  }
  if (target.type === 'photo') {
    const p = await db.photo.findFirst({
      where: { id: target.id, status: 'ACTIVE' },
      select: { uploaderId: true, businessPostId: true },
    });
    if (!p) throw NOT_FOUND();
    return {
      key: `photo:${target.id}`,
      data: { photoId: target.id },
      authorUserId: p.uploaderId,
      authorGuestId: null,
      business: p.businessPostId !== null,
    } satisfies ResolvedTarget;
  }
  const c = await db.comment.findFirst({
    where: { id: target.id, status: 'VISIBLE' },
    select: { authorUserId: true, authorGuestId: true, businessPostId: true },
  });
  if (!c) throw NOT_FOUND();
  return {
    key: `comment:${target.id}`,
    data: { commentId: target.id },
    authorUserId: c.authorUserId,
    authorGuestId: c.authorGuestId,
    business: c.businessPostId !== null,
  } satisfies ResolvedTarget;
}

export async function createReport(
  actor: Actor,
  input: { target: ReportTarget; reason: ReportReason; details?: string },
): Promise<{ created: boolean }> {
  const viewerUserId = actor.kind === 'user' ? actor.user.id : null;
  const t = await resolveTarget(input.target, viewerUserId);
  // Business rooms are for registered users only (P4.2), so guests never see them.
  if (actor.kind === 'guest' && t.business) {
    throw new ApiError(403, 'GUEST_NOT_ALLOWED', 'Create a free account to do this.');
  }
  const own =
    actor.kind === 'user' ? t.authorUserId === actor.user.id : t.authorGuestId === actor.guest.id;
  if (own) throw new ApiError(400, 'CANNOT_REPORT_OWN', 'You can’t report your own content.');

  const reporter =
    actor.kind === 'user' ? { reporterUserId: actor.user.id } : { reporterGuestId: actor.guest.id };
  const reporterKey = actor.kind === 'user' ? `user:${actor.user.id}` : `guest:${actor.guest.id}`;

  const [autoHideAt, suspendCfg] = await Promise.all([
    getConfig('moderation.autoHideReports'),
    autoSuspendConfig(),
  ]);
  return db.$transaction(async (tx) => {
    // Serializes the same reporter + item so a double tap can't create two reports.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'report:' + reporterKey + ':' + t.key}))`;
    const where = { ...reporter, status: 'OPEN' as const, ...targetWhere(t) };
    if (await tx.report.findFirst({ where, select: { id: true } })) return { created: false };
    await tx.report.create({
      data: {
        ...reporter,
        ...t.data,
        reason: input.reason,
        details: input.details || null,
      },
    });
    await autoHide(tx, t, autoHideAt);
    // D74: many different people reporting one account suspends it pending review.
    if (t.authorUserId) await maybeAutoSuspend(tx, t.authorUserId, suspendCfg);
    return { created: true };
  });
}

/**
 * D73: once enough different people have open reports on a post, it's held for review
 * (hidden from everyone) right away; a moderator publishes or removes it from the portal,
 * where every reporter and the author are listed. The per-item lock makes simultaneous
 * reports count each other.
 */
async function autoHide(tx: Prisma.TransactionClient, t: ResolvedTarget, threshold: number) {
  if (t.data.cityTopicId) return autoHideTopic(tx, t, t.data.cityTopicId);
  const id = t.data.generalPostId ?? t.data.businessPostId;
  if (!id) return; // posts and topics only
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'autohide:' + t.key}))`;
  const [row] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(DISTINCT "reporterUserId")::int AS n FROM "Report"
    WHERE status = 'OPEN' AND "reporterUserId" IS NOT NULL
      AND ${t.data.generalPostId ? Prisma.sql`"generalPostId"` : Prisma.sql`"businessPostId"`} = ${id}::uuid`;
  if ((row?.n ?? 0) < threshold) return;
  if (t.data.generalPostId) {
    await tx.generalPost.updateMany({
      where: { id, status: 'VISIBLE' },
      data: { status: 'HELD_FOR_REVIEW' },
    });
    return;
  }
  const rows = await tx.$queryRaw<{ placeId: string }[]>`
    UPDATE "BusinessPost" SET status = 'HELD_FOR_REVIEW', "updatedAt" = now()
    WHERE id = ${id}::uuid AND status = 'VISIBLE' RETURNING "placeId"`;
  if (rows[0]) {
    await tx.businessPlace.update({
      where: { id: rows[0].placeId },
      data: { postCount: { decrement: 1 } },
    });
  }
}

/**
 * D134: a topic is held for review (hidden) once topics.autoHideReports different people
 * have open reports on it (15 by default; posts use 3).
 */
async function autoHideTopic(tx: Prisma.TransactionClient, t: ResolvedTarget, id: string) {
  const threshold = await getConfig('topics.autoHideReports');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'autohide:' + t.key}))`;
  const [row] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(DISTINCT "reporterUserId")::int AS n FROM "Report"
    WHERE status = 'OPEN' AND "reporterUserId" IS NOT NULL AND "cityTopicId" = ${id}::uuid`;
  if ((row?.n ?? 0) < threshold) return;
  await tx.cityTopic.updateMany({
    where: { id, status: { in: ['ACTIVE', 'CLOSED'] } },
    data: { status: 'HELD' },
  });
}

/** Matches the report's target column (a user report has only `reportedUserId`). */
function targetWhere(t: ResolvedTarget) {
  if (t.data.generalPostId) return { generalPostId: t.data.generalPostId };
  if (t.data.businessPostId) return { businessPostId: t.data.businessPostId };
  if (t.data.commentId) return { commentId: t.data.commentId };
  if (t.data.photoId) return { photoId: t.data.photoId };
  if (t.data.messageId) return { messageId: t.data.messageId };
  if (t.data.cityTopicId) return { cityTopicId: t.data.cityTopicId };
  // A report has exactly one target column (DB check `Report_one_target`).
  return { reportedUserId: t.data.reportedUserId };
}

const PREVIEW = 80;
const preview = (body: string, status: string) =>
  status !== 'VISIBLE'
    ? '[no longer visible]'
    : body.length > PREVIEW
      ? `${body.slice(0, PREVIEW - 1)}…`
      : body;

/** P4.11: "My reports" and their status. No moderator identity or notes. */
export async function listMyReports(userId: string): Promise<MyReport[]> {
  const rows = await db.report.findMany({
    where: { reporterUserId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      generalPost: { select: { body: true, status: true } },
      businessPost: { select: { body: true, status: true } },
      comment: { select: { body: true, status: true } },
      photo: { select: { status: true } },
      reportedUser: { select: { username: true, status: true } },
      cityTopic: { select: { title: true, status: true } },
    },
  });
  return rows.map((r) => {
    const content = r.generalPost ?? r.businessPost ?? r.comment;
    const targetType: MyReport['targetType'] = r.generalPost
      ? 'general'
      : r.businessPost
        ? 'business'
        : r.comment
          ? 'comment'
          : r.photo
            ? 'photo'
            : r.cityTopic
              ? 'topic'
              : 'user';
    return {
      id: r.id,
      targetType,
      preview: r.photo
        ? r.photo.status === 'ACTIVE'
          ? '[photo]'
          : '[no longer visible]'
        : r.cityTopic
          ? r.cityTopic.status === 'REMOVED'
            ? '[no longer visible]'
            : r.cityTopic.title
          : content
            ? preview(content.body, content.status)
            : r.reportedUser && r.reportedUser.status !== 'DELETED'
              ? r.reportedUser.username
              : '[no longer visible]',
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    };
  });
}
