import { Prisma, type ContentStatus, type ReportReason } from '@/generated/prisma/client';
import { DEFAULT_ENFORCEMENT_REASON } from '@jax/shared';
import { db } from '../db';
import { resetAdCache } from '../ads/serve';
import { ApiError } from '../http';
import { issueStrike, type StrikeOutcome } from '../moderation/enforcement';
import { audit } from './audit';
import { pageInfo, pageWindow, toPage } from './paging';

/**
 * P5.14 moderation queue (§10.3, D61). Open reports are grouped into one **case** per
 * reported thing (post, room post, comment or profile). Content held by automatic
 * screening arrives here as a report with no reporter.
 *
 * Decisions on a case close all its open reports at once, record a ModerationAction
 * (P5.15) and an audit entry (P5.16), and can add a strike to the author (P5.6).
 */

export type CaseType =
  | 'general'
  | 'business'
  | 'comment'
  | 'photo'
  | 'user'
  | 'message'
  | 'topic' // D133
  | 'ad' // D209
  | 'event'; // D230
export interface CaseRef {
  type: CaseType;
  id: string;
}

const COLUMN: Record<
  Exclude<CaseType, 'user' | 'message'>,
  'generalPostId' | 'businessPostId' | 'commentId' | 'photoId' | 'cityTopicId' | 'adId' | 'eventId'
> = {
  general: 'generalPostId',
  business: 'businessPostId',
  comment: 'commentId',
  photo: 'photoId',
  topic: 'cityTopicId',
  ad: 'adId',
  event: 'eventId',
};

export function refOf(r: {
  generalPostId: string | null;
  businessPostId: string | null;
  commentId: string | null;
  photoId: string | null;
  reportedUserId: string | null;
  messageId?: string | null;
  messageEvidence?: unknown;
  cityTopicId?: string | null;
  adId?: string | null;
  eventId?: string | null;
}): CaseRef | null {
  if (r.eventId) return { type: 'event', id: r.eventId }; // D230
  if (r.adId) return { type: 'ad', id: r.adId }; // D209
  if (r.cityTopicId) return { type: 'topic', id: r.cityTopicId };
  // D98: a reported message (its snapshot keeps the case even after it's unsent).
  if (r.messageId) return { type: 'message', id: r.messageId };
  const ev = r.messageEvidence as { messageId?: string } | null | undefined;
  if (ev?.messageId) return { type: 'message', id: ev.messageId };
  if (r.generalPostId) return { type: 'general', id: r.generalPostId };
  if (r.businessPostId) return { type: 'business', id: r.businessPostId };
  if (r.commentId) return { type: 'comment', id: r.commentId };
  if (r.photoId) return { type: 'photo', id: r.photoId };
  if (r.reportedUserId) return { type: 'user', id: r.reportedUserId };
  return null;
}

const reportWhere = (ref: CaseRef): Prisma.ReportWhereInput =>
  ref.type === 'message'
    ? {
        OR: [{ messageId: ref.id }, { messageEvidence: { path: ['messageId'], equals: ref.id } }],
      }
    : ref.type === 'user'
      ? {
          reportedUserId: ref.id,
          generalPostId: null,
          businessPostId: null,
          commentId: null,
          photoId: null,
        }
      : { [COLUMN[ref.type as Exclude<CaseType, 'user' | 'message'>]]: ref.id };

const preview = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Most urgent first: child safety and threats, then held content, then by report count. */
const URGENT: ReportReason[] = ['CHILD_SAFETY', 'THREAT'];

// ───────────────────────────── Queue ─────────────────────────────

/**
 * The open reports grouped into one case per reported item, most urgent first (child safety
 * and threats, then held content, then the most reports, then the oldest), 20 a page (D210).
 * Grouped and ordered in the database, so only one page of cases is ever loaded.
 */
export async function listCases(opts: { type?: CaseType; page?: number } = {}) {
  const page = opts.page ?? 1;
  const { skip, take } = pageWindow(page);
  // The same order of columns as refOf().
  const grouped = Prisma.sql`
    WITH r AS (
      SELECT CASE
               WHEN "eventId" IS NOT NULL THEN 'event'
               WHEN "adId" IS NOT NULL THEN 'ad'
               WHEN "cityTopicId" IS NOT NULL THEN 'topic'
               WHEN "messageId" IS NOT NULL OR "messageEvidence"->>'messageId' IS NOT NULL
                 THEN 'message'
               WHEN "generalPostId" IS NOT NULL THEN 'general'
               WHEN "businessPostId" IS NOT NULL THEN 'business'
               WHEN "commentId" IS NOT NULL THEN 'comment'
               WHEN "photoId" IS NOT NULL THEN 'photo'
               WHEN "reportedUserId" IS NOT NULL THEN 'user'
             END AS type,
             COALESCE("eventId", "adId", "cityTopicId", "messageId", ("messageEvidence"->>'messageId')::uuid,
                      "generalPostId", "businessPostId", "commentId", "photoId",
                      "reportedUserId") AS id,
             reason::text AS reason, "reporterUserId", "reporterGuestId", "reporterBusinessId",
             "createdAt"
      FROM "Report" WHERE status = 'OPEN'
    ), g AS (
      SELECT type, id,
             array_agg(DISTINCT reason) AS reasons,
             count(*)::int AS n,
             -- D194: a business reporter; otherwise no person at all is automatic screening.
             bool_or("reporterBusinessId" IS NOT NULL) AS "fromBusiness",
             bool_or("reporterBusinessId" IS NULL AND "reporterUserId" IS NULL
                     AND "reporterGuestId" IS NULL) AS automatic,
             min("createdAt") AS first,
             bool_or(reason IN (${Prisma.join(URGENT)})) AS urgent
      FROM r
      WHERE type IS NOT NULL ${opts.type ? Prisma.sql`AND type = ${opts.type}` : Prisma.empty}
      GROUP BY type, id
    )`;
  const [rows, count] = await Promise.all([
    db.$queryRaw<
      {
        type: CaseType;
        id: string;
        reasons: ReportReason[];
        n: number;
        fromBusiness: boolean;
        automatic: boolean;
        first: Date;
      }[]
    >`
      ${grouped}
      SELECT * FROM (
        SELECT g.*,
               COALESCE(CASE g.type
                 WHEN 'general' THEN
                   (SELECT status::text FROM "GeneralPost" WHERE id = g.id) = 'HELD_FOR_REVIEW'
                 WHEN 'business' THEN
                   (SELECT status::text FROM "BusinessPost" WHERE id = g.id) = 'HELD_FOR_REVIEW'
                 WHEN 'comment' THEN
                   (SELECT status::text FROM "Comment" WHERE id = g.id) = 'HELD_FOR_REVIEW'
                 WHEN 'photo' THEN
                   (SELECT status::text NOT IN ('ACTIVE', 'REMOVED') FROM "Photo" WHERE id = g.id)
                 WHEN 'topic' THEN (SELECT status::text FROM "CityTopic" WHERE id = g.id) = 'HELD'
               END, false) AS held
        FROM g
      ) x
      ORDER BY CASE WHEN urgent THEN 0 WHEN held THEN 1 ELSE 2 END, n DESC, first, type, id
      LIMIT ${take} OFFSET ${skip}`,
    db.$queryRaw<{ n: number }[]>`${grouped} SELECT count(*)::int AS n FROM g`,
  ]);
  const list = await Promise.all(
    rows.map(async (c) => {
      const s = await subject({ type: c.type, id: c.id } as CaseRef);
      return {
        type: c.type,
        id: c.id,
        reasons: c.reasons,
        reportCount: c.n,
        automatic: c.automatic,
        fromBusiness: c.fromBusiness,
        firstReportedAt: c.first.toISOString(),
        preview: s ? preview(s.body) : '[gone]',
        contentStatus: s?.status ?? null,
        author: s?.author ?? null,
      };
    }),
  );
  return toPage(list, count[0]?.n ?? 0, page);
}

type Author =
  | { id: string; username: string; status: string }
  | { guest: true }
  /** D172: written on the business website by this business login (the real author). */
  | { business: true; accountId: string; signInName: string }
  | null;

const businessLogin = { select: { id: true, email: true, username: true } } as const;
const asBusiness = (a: { id: string; email: string | null; username: string | null } | null) =>
  a ? { business: true as const, accountId: a.id, signInName: a.username ?? a.email ?? '' } : null;

/** D209: the admin link to a reported ad's picture (the admin route serves any business image). */
async function adImageForAdmin(adId: string) {
  const a = await db.ad.findUnique({ where: { id: adId }, select: { mediaId: true } });
  return a?.mediaId ? `/api/v1/admin/business-pictures/${a.mediaId}` : null;
}

/** The reported thing's text, status and author. */
async function subject(
  ref: CaseRef,
): Promise<{ body: string; status: ContentStatus | 'ACCOUNT'; author: Author } | null> {
  const user = { select: { id: true, username: true, status: true } } as const;
  if (ref.type === 'general') {
    const p = await db.generalPost.findUnique({ where: { id: ref.id }, include: { author: user } });
    return p && { body: p.body, status: p.status, author: p.author };
  }
  if (ref.type === 'business') {
    const p = await db.businessPost.findUnique({
      where: { id: ref.id },
      include: { author: user, businessAuthor: businessLogin },
    });
    return (
      p && { body: p.body, status: p.status, author: p.author ?? asBusiness(p.businessAuthor) }
    );
  }
  if (ref.type === 'comment') {
    const c = await db.comment.findUnique({
      where: { id: ref.id },
      include: { authorUser: user, authorBusiness: businessLogin },
    });
    return (
      c && {
        body: c.body,
        status: c.status,
        author:
          c.authorUser ??
          asBusiness(c.authorBusiness) ??
          (c.authorKind === 'GUEST' ? { guest: true } : null),
      }
    );
  }
  if (ref.type === 'ad') {
    // D209: a reported ad, from the business that runs it.
    const a = await db.ad.findUnique({
      where: { id: ref.id },
      include: { account: businessLogin },
    });
    return (
      a && {
        body: `Ad: ${a.headline}${a.body ? ` · ${a.body}` : ''}`,
        status: a.status === 'ENDED' ? 'REMOVED' : 'VISIBLE',
        author: asBusiness(a.account),
      }
    );
  }
  if (ref.type === 'event') {
    // D230: a reported event: its title and description, and who suggested it or which
    // business or organizer runs it.
    const e = await db.event.findUnique({
      where: { id: ref.id },
      include: {
        createdBy: { select: { id: true, username: true, status: true, role: true } },
        businessAccount: businessLogin,
      },
    });
    if (!e) return null;
    const by = e.createdBy && e.createdBy.role !== 'ADMIN' ? e.createdBy : null;
    return {
      body: `Event: ${e.title} · ${e.description}`,
      status: e.status === 'REMOVED' ? 'REMOVED' : 'VISIBLE',
      author:
        asBusiness(e.businessAccount) ??
        (by ? { id: by.id, username: by.username, status: by.status } : null),
    };
  }
  if (ref.type === 'topic') {
    // D133: a topic's title and description, and who made it.
    const t = await db.cityTopic.findUnique({
      where: { id: ref.id },
      include: { createdBy: user },
    });
    return (
      t && {
        body: `Topic: ${t.title}${t.description ? ` · ${t.description}` : ''}`,
        status:
          t.status === 'REMOVED'
            ? 'REMOVED'
            : t.status === 'HELD'
              ? 'HELD_FOR_REVIEW'
              : t.status === 'DELETED'
                ? 'DELETED'
                : 'VISIBLE',
        author: t.createdBy,
      }
    );
  }
  if (ref.type === 'photo') {
    const ph = await db.photo.findUnique({
      where: { id: ref.id },
      include: { uploader: user, uploaderBusiness: businessLogin }, // D195
    });
    return (
      ph && {
        body: '[photo]',
        status:
          ph.status === 'ACTIVE'
            ? 'VISIBLE'
            : ph.status === 'REMOVED'
              ? 'REMOVED'
              : 'HELD_FOR_REVIEW',
        author: ph.uploader ?? asBusiness(ph.uploaderBusiness),
      }
    );
  }
  if (ref.type === 'message') {
    // D98: the snapshot taken when it was reported (the message may since be unsent).
    const r = await db.report.findFirst({
      where: { ...reportWhere(ref), messageEvidence: { not: Prisma.DbNull } },
      orderBy: { createdAt: 'desc' },
      select: { messageEvidence: true, message: { select: { unsentAt: true, senderId: true } } },
    });
    const ev = r?.messageEvidence as
      { messages: { id: string; sender: string; body: string; reported: boolean }[] } | undefined;
    const reported = ev?.messages.find((m) => m.reported);
    if (!reported) return null;
    const sender = await db.user.findUnique({
      where: { usernameNormalized: reported.sender.toLowerCase() },
      select: user.select,
    });
    return {
      body: reported.body || '[photo]',
      status: r?.message && !r.message.unsentAt ? 'VISIBLE' : 'REMOVED',
      author: sender,
    };
  }
  const u = await db.user.findUnique({ where: { id: ref.id }, include: { profile: true } });
  return (
    u && {
      body: `@${u.username}${u.profile?.bio ? ` · ${u.profile.bio}` : ''}`,
      status: 'ACCOUNT',
      author: { id: u.id, username: u.username, status: u.status },
    }
  );
}

// ───────────────────────────── Case detail ─────────────────────────────

/**
 * One case. Every report is stored; the page shows a per-reason summary and the reports
 * newest first, 20 a page (D74, D210); the account's own reports and history page too.
 */
export async function getCase(
  ref: CaseRef,
  opts: { reportsPage?: number; accountReportsPage?: number; historyPage?: number } = {},
) {
  const s = await subject(ref);
  if (!s) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  const reportsPage = opts.reportsPage ?? 1;
  const [reports, byReason, evidence] = await Promise.all([
    db.report.findMany({
      where: reportWhere(ref),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(reportsPage),
      include: {
        ...REPORTER_INCLUDE,
        resolvedBy: { select: { username: true } },
      },
    }),
    db.report.groupBy({ by: ['reason'], where: reportWhere(ref), _count: { _all: true } }),
    // D98: the chat around a reported message comes from the newest report's snapshot.
    ref.type === 'message'
      ? db.report.findFirst({
          where: { ...reportWhere(ref), messageEvidence: { not: Prisma.DbNull } },
          orderBy: { createdAt: 'desc' },
          select: { messageEvidence: true, chatEvidence: true },
        })
      : ref.type === 'user'
        ? // D218: the person's area-chat lines, copied when they were reported.
          db.report.findFirst({
            where: { ...reportWhere(ref), chatEvidence: { not: Prisma.DbNull } },
            orderBy: { createdAt: 'desc' },
            select: { messageEvidence: true, chatEvidence: true },
          })
        : null,
  ]);

  // Context: the post a comment belongs to, and the comment it replies to.
  let context: { post?: string; parent?: string; place?: string } = {};
  if (ref.type === 'comment') {
    const c = await db.comment.findUniqueOrThrow({
      where: { id: ref.id },
      include: {
        generalPost: { select: { body: true } },
        businessPost: { select: { body: true, place: { select: { name: true } } } },
        parent: { select: { body: true, status: true } },
      },
    });
    context = {
      post: c.generalPost?.body ?? c.businessPost?.body,
      place: c.businessPost?.place.name,
      parent: c.parent
        ? c.parent.status === 'VISIBLE'
          ? c.parent.body
          : '[not visible]'
        : undefined,
    };
  } else if (ref.type === 'business') {
    const p = await db.businessPost.findUniqueOrThrow({
      where: { id: ref.id },
      include: { place: { select: { name: true } } },
    });
    context = { place: p.place.name };
  }

  const authorId = s.author && 'id' in s.author ? s.author.id : null;
  const video =
    ref.type === 'general' || ref.type === 'business'
      ? await db.photo.findFirst({
          where: {
            kind: 'VIDEO',
            ...(ref.type === 'general' ? { generalPostId: ref.id } : { businessPostId: ref.id }),
          },
          select: { id: true },
        })
      : null;
  const voice =
    ref.type === 'general' || ref.type === 'business'
      ? await db.photo.findFirst({
          where: {
            kind: 'AUDIO',
            ...(ref.type === 'general' ? { generalPostId: ref.id } : { businessPostId: ref.id }),
          },
          select: { id: true },
        })
      : null;
  // D74: for an account, every report on anything it posted too (who, why, on what), so an
  // automatic suspension can be checked for report abuse in one place.
  const accountWhere: Prisma.ReportWhereInput = {
    OR: [
      { generalPost: { authorId: ref.id } },
      { businessPost: { authorId: ref.id } },
      { comment: { authorUserId: ref.id } },
      { photo: { uploaderId: ref.id } },
    ],
  };
  const accountReportsPage = opts.accountReportsPage ?? 1;
  const accountReportsTotal =
    ref.type === 'user' ? await db.report.count({ where: accountWhere }) : 0;
  const accountReports =
    ref.type === 'user'
      ? (
          await db.report.findMany({
            where: accountWhere,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...pageWindow(accountReportsPage),
            include: {
              ...REPORTER_INCLUDE,
              generalPost: { select: { body: true } },
              businessPost: { select: { body: true } },
              comment: { select: { body: true } },
            },
          })
        ).map((r) => ({
          id: r.id,
          reason: r.reason,
          details: r.details,
          reporter: reporterLabel(r),
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          on: r.generalPostId
            ? {
                type: 'general' as const,
                id: r.generalPostId,
                preview: preview(r.generalPost!.body),
              }
            : r.businessPostId
              ? {
                  type: 'business' as const,
                  id: r.businessPostId,
                  preview: preview(r.businessPost!.body),
                }
              : r.commentId
                ? { type: 'comment' as const, id: r.commentId, preview: preview(r.comment!.body) }
                : { type: 'photo' as const, id: r.photoId!, preview: '[photo]' },
        }))
      : null;
  const reportTotal = byReason.reduce((n, g) => n + g._count._all, 0);
  return {
    accountReports,
    accountReportsPage:
      ref.type === 'user' ? pageInfo(toPage([], accountReportsTotal, accountReportsPage)) : null,
    type: ref.type,
    id: ref.id,
    body: s.body,
    /** Admin-only image link (cookie-authenticated), for photo cases. */
    photoUrl:
      ref.type === 'photo'
        ? `/api/v1/admin/photos/${ref.id}`
        : ref.type === 'ad'
          ? await adImageForAdmin(ref.id) // D209: the reported ad's picture
          : null,
    /** D75: a voice post's clip, playable by the moderator (any status). */
    voiceUrl: voice ? `/api/v1/admin/photos/${voice.id}` : null,
    /** D102: a video post's clip, playable by the moderator. */
    videoUrl: video ? `/api/v1/admin/photos/${video.id}` : null,
    /** D98: the chat around a reported message, from the newest report's snapshot. */
    messageContext:
      ref.type === 'message'
        ? ((
            evidence?.messageEvidence as {
              messages: {
                id: string;
                sender: string;
                body: string;
                photoIds: string[];
                createdAt: string;
                reported: boolean;
              }[];
            } | null
          )?.messages ?? null)
        : null,
    /** D218: the reported person's last area-chat lines, from the newest chat report. */
    chatContext:
      ref.type === 'user'
        ? ((evidence?.chatEvidence as {
            room: string;
            lines: { at: string; body: string }[];
          } | null) ?? null)
        : null,
    contentStatus: s.status,
    author: s.author,
    authorHistory: authorId ? await userHistory(authorId, opts.historyPage) : null,
    context,
    /** D74: totals per reason across every report; the list below is one page of them. */
    reportTotal,
    reportsPage: pageInfo(toPage([], reportTotal, reportsPage)),
    reportsByReason: byReason
      .map((g) => ({ reason: g.reason, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    reports: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      reporter: reporterLabel(r),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      resolvedBy: r.resolvedBy?.username ?? null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    })),
  };
}

/** For admins only: strikes (including cancelled ones), reports against, content removed. */
/** Reports about a person: their profile, or a post, comment, photo or message of theirs. */
export const reportsAgainstWhere = (userId: string): Prisma.ReportWhereInput => ({
  OR: [
    { reportedUserId: userId },
    { generalPost: { authorId: userId } },
    { businessPost: { authorId: userId } },
    { comment: { authorUserId: userId } },
    { photo: { uploaderId: userId } },
    { message: { senderId: userId } },
  ],
});

/** What the portal needs to say who filed a report (D194: including a business login). */
export const REPORTER_INCLUDE = {
  reporterUser: { select: { username: true } },
  reporterBusiness: {
    select: {
      username: true,
      email: true,
      placeAccess: {
        where: { revokedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { place: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.ReportInclude;

/** "@ann", "guest", "a business: Bold Bean (sam.bb)" or "automatic screening". */
export function reporterLabel(r: {
  reporterGuestId: string | null;
  reporterUser?: { username: string } | null;
  reporterBusiness?: {
    username: string | null;
    email: string | null;
    placeAccess: { place: { name: string } }[];
  } | null;
}): string {
  if (r.reporterUser) return `@${r.reporterUser.username}`;
  if (r.reporterBusiness) {
    const place = r.reporterBusiness.placeAccess[0]?.place.name ?? 'no place now';
    const login = r.reporterBusiness.username ?? r.reporterBusiness.email ?? '';
    return `a business: ${place} (${login})`;
  }
  return r.reporterGuestId ? 'guest' : 'automatic screening';
}

/** A person's record; their strikes, notes and other actions newest first, 20 a page (D210). */
export async function userHistory(userId: string, actionsPage = 1) {
  const [actions, actionsTotal, reportsAgainst, removed, flags] = await Promise.all([
    db.moderationAction.findMany({
      where: { targetUserId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(actionsPage),
      include: { admin: { select: { username: true } } },
    }),
    db.moderationAction.count({ where: { targetUserId: userId } }),
    db.report.count({ where: reportsAgainstWhere(userId) }),
    Promise.all([
      db.generalPost.count({ where: { authorId: userId, status: 'REMOVED' } }),
      db.businessPost.count({ where: { authorId: userId, status: 'REMOVED' } }),
      db.comment.count({ where: { authorUserId: userId, status: 'REMOVED' } }),
    ]).then((n) => n.reduce((a, b) => a + b, 0)),
    db.locationFlag.count({ where: { userId } }),
  ]);
  return {
    reportsAgainst,
    contentRemoved: removed,
    locationFlags: flags,
    actionsPage: pageInfo(toPage([], actionsTotal, actionsPage)),
    actions: actions.map((a) => ({
      id: a.id,
      action: a.action,
      reason: a.reason,
      internalNote: a.internalNote,
      by: a.admin.username,
      createdAt: a.createdAt.toISOString(),
      expiresAt: a.expiresAt?.toISOString() ?? null,
      voidedAt: a.voidedAt?.toISOString() ?? null,
      voidReason: a.voidReason,
    })),
  };
}

// ───────────────────────────── Decisions ─────────────────────────────

export type Decision =
  | 'remove' // hide it (REMOVED); counts go down
  | 'approve' // held content goes live, or removed content is restored
  | 'dismiss' // nothing wrong: close the reports, leave the content as is
  | 'escalate'; // child safety: hide, preserve, legal hold (R4)

/** Moves content between statuses and keeps the post/place/comment counters right. */
async function setStatus(
  tx: Prisma.TransactionClient,
  ref: { type: Exclude<CaseType, 'user'>; id: string },
  to: 'VISIBLE' | 'REMOVED',
) {
  if (ref.type === 'message') {
    // D98: removing a message unsends it for both people (the report keeps the snapshot).
    if (to === 'REMOVED') {
      await tx.message.updateMany({
        where: { id: ref.id, unsentAt: null },
        data: { unsentAt: new Date(), bodyEnc: null },
      });
      await tx.photo.updateMany({
        where: { messageId: ref.id },
        data: { status: 'REMOVED', removedAt: new Date() },
      });
    }
    return true;
  }
  if (ref.type === 'ad') {
    // D209: removing an ad ends it (the business can't simply resume an ended ad; it can
    // edit it and send it for review again). Restoring puts it back as approved.
    const a = await tx.ad.findUniqueOrThrow({ where: { id: ref.id } });
    if (to === 'REMOVED' && a.status !== 'ENDED') {
      await tx.ad.update({ where: { id: ref.id }, data: { status: 'ENDED' } });
    } else if (to === 'VISIBLE' && a.status === 'ENDED') {
      await tx.ad.update({ where: { id: ref.id }, data: { status: 'APPROVED' } });
    }
    resetAdCache();
    return a.status !== 'ENDED';
  }
  if (ref.type === 'event') {
    // D230: removing an event takes it off the calendar; restoring puts it back as approved.
    const e = await tx.event.findUniqueOrThrow({ where: { id: ref.id } });
    if (to === 'REMOVED' && e.status !== 'REMOVED') {
      await tx.event.update({ where: { id: ref.id }, data: { status: 'REMOVED' } });
    } else if (to === 'VISIBLE' && e.status === 'REMOVED') {
      await tx.event.update({ where: { id: ref.id }, data: { status: 'APPROVED' } });
    }
    return e.status !== 'REMOVED';
  }
  if (ref.type === 'topic') {
    // D133: a removed topic is hidden everywhere (its posts with it); restoring reopens it.
    const t = await tx.cityTopic.findUniqueOrThrow({ where: { id: ref.id } });
    if (t.status === 'DELETED') throw new ApiError(409, 'DELETED', 'The creator deleted this');
    await tx.cityTopic.update({
      where: { id: ref.id },
      data: { status: to === 'VISIBLE' ? 'ACTIVE' : 'REMOVED' },
    });
    return t.status !== 'REMOVED';
  }
  if (ref.type === 'photo') {
    // The object stays in storage (evidence); a removed photo is never served (P6.4).
    await tx.photo.update({
      where: { id: ref.id },
      data: {
        status: to === 'VISIBLE' ? 'ACTIVE' : 'REMOVED',
        removedAt: to === 'VISIBLE' ? null : new Date(),
      },
    });
    return true;
  }
  const visibleBefore = await (async () => {
    if (ref.type === 'general') {
      const p = await tx.generalPost.findUniqueOrThrow({ where: { id: ref.id } });
      if (p.status === 'DELETED') throw new ApiError(409, 'DELETED', 'The author deleted this');
      await tx.generalPost.update({ where: { id: ref.id }, data: { status: to } });
      return p.status === 'VISIBLE';
    }
    if (ref.type === 'business') {
      const p = await tx.businessPost.findUniqueOrThrow({ where: { id: ref.id } });
      if (p.status === 'DELETED') throw new ApiError(409, 'DELETED', 'The author deleted this');
      await tx.businessPost.update({ where: { id: ref.id }, data: { status: to } });
      const delta = (to === 'VISIBLE' ? 1 : 0) - (p.status === 'VISIBLE' ? 1 : 0);
      if (delta) {
        await tx.businessPlace.update({
          where: { id: p.placeId },
          data: { postCount: { increment: delta } },
        });
      }
      return p.status === 'VISIBLE';
    }
    const c = await tx.comment.findUniqueOrThrow({ where: { id: ref.id } });
    if (c.status === 'DELETED') throw new ApiError(409, 'DELETED', 'The author deleted this');
    await tx.comment.update({ where: { id: ref.id }, data: { status: to } });
    const delta = (to === 'VISIBLE' ? 1 : 0) - (c.status === 'VISIBLE' ? 1 : 0);
    if (delta && c.generalPostId) {
      await tx.generalPost.update({
        where: { id: c.generalPostId },
        data: { commentCount: { increment: delta } },
      });
    } else if (delta && c.businessPostId) {
      await tx.businessPost.update({
        where: { id: c.businessPostId },
        data: { commentCount: { increment: delta } },
      });
    }
    return c.status === 'VISIBLE';
  })();
  return visibleBefore;
}

/** D196: what's recorded when the admin decides a case without a reason. */
const DEFAULT_CASE_REASON: Record<Decision, string> = {
  remove: DEFAULT_ENFORCEMENT_REASON,
  approve: 'Reviewed: allowed',
  dismiss: 'Reviewed: no rule broken',
  escalate: 'Child-safety escalation',
};

export async function decideCase(input: {
  adminId: string;
  ref: CaseRef;
  decision: Decision;
  /** Shown to the author if a strike is given; kept on the record either way. Blank: D196. */
  reason?: string;
  internalNote?: string;
  strike?: boolean;
  /** D205: removing only: tell the author, with the reason. */
  notifyAuthor?: boolean;
  now?: Date;
}): Promise<{ strike: StrikeOutcome | null }> {
  const now = input.now ?? new Date();
  const reason = input.reason ?? DEFAULT_CASE_REASON[input.decision];
  const s = await subject(input.ref);
  if (!s) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  const authorId = s.author && 'id' in s.author ? s.author.id : null;
  if (input.ref.type === 'user' && (input.decision === 'remove' || input.decision === 'approve')) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Profiles can be dismissed, escalated, or get a strike',
    );
  }

  await db.$transaction(async (tx) => {
    const open = await tx.report.findMany({
      where: { ...reportWhere(input.ref), status: 'OPEN' },
      select: { id: true },
    });
    if (input.ref.type !== 'user') {
      const ref = input.ref as { type: Exclude<CaseType, 'user'>; id: string };
      if (input.decision === 'remove' || input.decision === 'escalate') {
        await setStatus(tx, ref, 'REMOVED');
      } else if (input.decision === 'approve') {
        await setStatus(tx, ref, 'VISIBLE');
      }
    }
    await tx.report.updateMany({
      where: { id: { in: open.map((r) => r.id) } },
      data: {
        status: input.decision === 'dismiss' ? 'DISMISSED' : 'ACTIONED',
        resolvedById: input.adminId,
        resolvedAt: now,
      },
    });
    const contentAction =
      input.decision === 'remove' || input.decision === 'escalate'
        ? 'REMOVE_CONTENT'
        : input.decision === 'approve'
          ? 'RESTORE_CONTENT'
          : 'NOTE';
    const action = await tx.moderationAction.create({
      data: {
        adminId: input.adminId,
        action: contentAction,
        reason,
        internalNote: input.internalNote ?? null,
        targetUserId: authorId,
        // A moderation action points at posts, comments and photos; topics and messages are
        // identified through the report and the audit log.
        ...(input.ref.type === 'user' ||
        input.ref.type === 'message' ||
        input.ref.type === 'topic' ||
        input.ref.type === 'ad' ||
        input.ref.type === 'event'
          ? {}
          : { [COLUMN[input.ref.type]]: input.ref.id }),
        reportId: open[0]?.id ?? null,
        createdAt: now,
      },
    });
    if (input.notifyAuthor && input.decision === 'remove' && authorId) {
      await tx.notification.create({
        data: {
          userId: authorId,
          type: 'CONTENT_REMOVED',
          moderationActionId: action.id,
          createdAt: now,
        },
      });
    }
    if (input.decision === 'escalate' && authorId) {
      // R4: preserve evidence. The legal hold stops any crypto-shredding (D37).
      await tx.user.update({
        where: { id: authorId },
        data: {
          legalHoldAt: now,
          legalHoldNote:
            `Child-safety escalation ${now.toISOString().slice(0, 10)}: ${reason}`.slice(0, 500),
        },
      });
    }
    await audit(
      input.adminId,
      input.decision === 'escalate'
        ? 'CHILD_SAFETY_ESCALATED'
        : `CASE_${input.decision.toUpperCase()}`,
      { type: input.ref.type, id: input.ref.id },
      { reports: open.length, strike: !!input.strike, notified: !!input.notifyAuthor },
      tx,
    );
  });

  let strike: StrikeOutcome | null = null;
  if (input.strike && authorId) {
    strike = await issueStrike({
      adminId: input.adminId,
      userId: authorId,
      reason: input.reason ?? DEFAULT_ENFORCEMENT_REASON,
      internalNote: input.internalNote,
      now,
    });
    await audit(
      input.adminId,
      `STRIKE_${strike.action}`,
      { type: 'user', id: authorId },
      {
        strike: strike.strike,
      },
    );
  }
  return { strike };
}
