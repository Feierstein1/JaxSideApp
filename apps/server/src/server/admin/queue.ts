import type { ContentStatus, Prisma, ReportReason } from '@/generated/prisma/client';
import { db } from '../db';
import { ApiError } from '../http';
import { issueStrike, type StrikeOutcome } from '../moderation/enforcement';
import { audit } from './audit';

/**
 * P5.14 moderation queue (§10.3, D61). Open reports are grouped into one **case** per
 * reported thing (post, room post, comment or profile). Content held by automatic
 * screening arrives here as a report with no reporter.
 *
 * Decisions on a case close all its open reports at once, record a ModerationAction
 * (P5.15) and an audit entry (P5.16), and can add a strike to the author (P5.6).
 */

export type CaseType = 'general' | 'business' | 'comment' | 'photo' | 'user';
export interface CaseRef {
  type: CaseType;
  id: string;
}

const COLUMN: Record<
  Exclude<CaseType, 'user'>,
  'generalPostId' | 'businessPostId' | 'commentId' | 'photoId'
> = {
  general: 'generalPostId',
  business: 'businessPostId',
  comment: 'commentId',
  photo: 'photoId',
};

function refOf(r: {
  generalPostId: string | null;
  businessPostId: string | null;
  commentId: string | null;
  photoId: string | null;
  reportedUserId: string | null;
}): CaseRef | null {
  if (r.generalPostId) return { type: 'general', id: r.generalPostId };
  if (r.businessPostId) return { type: 'business', id: r.businessPostId };
  if (r.commentId) return { type: 'comment', id: r.commentId };
  if (r.photoId) return { type: 'photo', id: r.photoId };
  if (r.reportedUserId) return { type: 'user', id: r.reportedUserId };
  return null;
}

const reportWhere = (ref: CaseRef): Prisma.ReportWhereInput =>
  ref.type === 'user'
    ? {
        reportedUserId: ref.id,
        generalPostId: null,
        businessPostId: null,
        commentId: null,
        photoId: null,
      }
    : { [COLUMN[ref.type]]: ref.id };

const preview = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Most urgent first: child safety and threats, then held content, then by report count. */
const URGENT: ReportReason[] = ['CHILD_SAFETY', 'THREAT'];

// ───────────────────────────── Queue ─────────────────────────────

export async function listCases(opts: { type?: CaseType } = {}) {
  const reports = await db.report.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'asc' },
    take: 2000,
    select: {
      generalPostId: true,
      businessPostId: true,
      commentId: true,
      photoId: true,
      reportedUserId: true,
      reason: true,
      reporterUserId: true,
      reporterGuestId: true,
      createdAt: true,
    },
  });
  const cases = new Map<
    string,
    { ref: CaseRef; reasons: Set<ReportReason>; count: number; automatic: boolean; first: Date }
  >();
  for (const r of reports) {
    const ref = refOf(r);
    if (!ref || (opts.type && ref.type !== opts.type)) continue;
    const key = `${ref.type}:${ref.id}`;
    const c = cases.get(key) ?? {
      ref,
      reasons: new Set<ReportReason>(),
      count: 0,
      automatic: false,
      first: r.createdAt,
    };
    c.reasons.add(r.reason);
    c.count++;
    if (!r.reporterUserId && !r.reporterGuestId) c.automatic = true;
    cases.set(key, c);
  }

  const out = await Promise.all(
    [...cases.values()].map(async (c) => {
      const s = await subject(c.ref);
      return {
        type: c.ref.type,
        id: c.ref.id,
        reasons: [...c.reasons],
        reportCount: c.count,
        automatic: c.automatic,
        firstReportedAt: c.first.toISOString(),
        preview: s ? preview(s.body) : '[gone]',
        contentStatus: s?.status ?? null,
        author: s?.author ?? null,
      };
    }),
  );
  const rank = (x: (typeof out)[number]) =>
    x.reasons.some((r) => URGENT.includes(r)) ? 0 : x.contentStatus === 'HELD_FOR_REVIEW' ? 1 : 2;
  return out.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.reportCount - a.reportCount ||
      a.firstReportedAt.localeCompare(b.firstReportedAt),
  );
}

type Author = { id: string; username: string; status: string } | { guest: true } | null;

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
      include: { author: user },
    });
    return p && { body: p.body, status: p.status, author: p.author };
  }
  if (ref.type === 'comment') {
    const c = await db.comment.findUnique({ where: { id: ref.id }, include: { authorUser: user } });
    return (
      c && {
        body: c.body,
        status: c.status,
        author: c.authorUser ?? (c.authorKind === 'GUEST' ? { guest: true } : null),
      }
    );
  }
  if (ref.type === 'photo') {
    const ph = await db.photo.findUnique({ where: { id: ref.id }, include: { uploader: user } });
    return (
      ph && {
        body: '[photo]',
        status:
          ph.status === 'ACTIVE'
            ? 'VISIBLE'
            : ph.status === 'REMOVED'
              ? 'REMOVED'
              : 'HELD_FOR_REVIEW',
        author: ph.uploader,
      }
    );
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

export async function getCase(ref: CaseRef) {
  const s = await subject(ref);
  if (!s) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  const reports = await db.report.findMany({
    where: reportWhere(ref),
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      reporterUser: { select: { username: true } },
      resolvedBy: { select: { username: true } },
    },
  });

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
  return {
    type: ref.type,
    id: ref.id,
    body: s.body,
    /** Admin-only image link (cookie-authenticated), for photo cases. */
    photoUrl: ref.type === 'photo' ? `/api/v1/admin/photos/${ref.id}` : null,
    contentStatus: s.status,
    author: s.author,
    authorHistory: authorId ? await userHistory(authorId) : null,
    context,
    reports: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      reporter: r.reporterUser?.username ?? (r.reporterGuestId ? 'guest' : 'automatic screening'),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      resolvedBy: r.resolvedBy?.username ?? null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    })),
  };
}

/** For admins only: strikes (including cancelled ones), reports against, content removed. */
export async function userHistory(userId: string) {
  const [actions, reportsAgainst, removed, flags] = await Promise.all([
    db.moderationAction.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { admin: { select: { username: true } } },
    }),
    db.report.count({
      where: {
        OR: [
          { reportedUserId: userId },
          { generalPost: { authorId: userId } },
          { businessPost: { authorId: userId } },
          { comment: { authorUserId: userId } },
        ],
      },
    }),
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

export async function decideCase(input: {
  adminId: string;
  ref: CaseRef;
  decision: Decision;
  /** Shown to the author if a strike is given; kept on the record either way. */
  reason: string;
  internalNote?: string;
  strike?: boolean;
  now?: Date;
}): Promise<{ strike: StrikeOutcome | null }> {
  const now = input.now ?? new Date();
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
    await tx.moderationAction.create({
      data: {
        adminId: input.adminId,
        action: contentAction,
        reason: input.reason,
        internalNote: input.internalNote ?? null,
        targetUserId: authorId,
        ...(input.ref.type === 'user' ? {} : { [COLUMN[input.ref.type]]: input.ref.id }),
        reportId: open[0]?.id ?? null,
        createdAt: now,
      },
    });
    if (input.decision === 'escalate' && authorId) {
      // R4: preserve evidence. The legal hold stops any crypto-shredding (D37).
      await tx.user.update({
        where: { id: authorId },
        data: {
          legalHoldAt: now,
          legalHoldNote:
            `Child-safety escalation ${now.toISOString().slice(0, 10)}: ${input.reason}`.slice(
              0,
              500,
            ),
        },
      });
    }
    await audit(
      input.adminId,
      input.decision === 'escalate'
        ? 'CHILD_SAFETY_ESCALATED'
        : `CASE_${input.decision.toUpperCase()}`,
      { type: input.ref.type, id: input.ref.id },
      { reports: open.length, strike: !!input.strike },
      tx,
    );
  });

  let strike: StrikeOutcome | null = null;
  if (input.strike && authorId) {
    strike = await issueStrike({
      adminId: input.adminId,
      userId: authorId,
      reason: input.reason,
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
