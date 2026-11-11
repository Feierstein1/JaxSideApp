import type { OrganizerStatus } from '@/generated/prisma/client';
import { pageWindow, toPage } from '../admin/paging';
import { db } from '../db';
import { ApiError } from '../http';

/*
 * D230: event organizers (festivals, nonprofits, promoters). The business website creates the
 * profile when someone signs up as an organizer; JaxSide approves it here. Only a VERIFIED
 * organizer's events can be sent for review on the website, and its name shows on its events
 * as "Hosted by".
 */

export async function adminListOrganizers(status: OrganizerStatus, page = 1) {
  const where = { status };
  const [rows, total] = await Promise.all([
    db.eventOrganizer.findMany({
      where,
      orderBy: [{ createdAt: status === 'PENDING' ? 'asc' : 'desc' }],
      ...pageWindow(page),
      include: {
        account: { select: { id: true, email: true } },
      },
    }),
    db.eventOrganizer.count({ where }),
  ]);
  const counts = await db.event.groupBy({
    by: ['businessAccountId'],
    where: { businessAccountId: { in: rows.map((r) => r.accountId) } },
    _count: { _all: true },
  });
  const events = new Map(counts.map((c) => [c.businessAccountId, c._count._all]));
  return toPage(
    rows.map((o) => ({
      accountId: o.accountId,
      email: o.account.email,
      name: o.name,
      website: o.website,
      about: o.about,
      contactName: o.contactName,
      contactPhone: o.contactPhone,
      status: o.status,
      decisionNote: o.decisionNote,
      events: events.get(o.accountId) ?? 0,
      createdAt: o.createdAt.toISOString(),
    })),
    total,
    page,
  );
}

const NEXT: Record<
  'approve' | 'reject' | 'revoke',
  { from: OrganizerStatus[]; to: OrganizerStatus }
> = {
  approve: { from: ['PENDING', 'REJECTED', 'REVOKED'], to: 'VERIFIED' },
  reject: { from: ['PENDING'], to: 'REJECTED' },
  revoke: { from: ['VERIFIED'], to: 'REVOKED' },
};

/** Approve, reject or revoke; the organizer is told in the website's bell. */
export async function adminDecideOrganizer(
  adminId: string,
  accountId: string,
  d: { action: 'approve' } | { action: 'reject' | 'revoke'; note: string },
  now = new Date(),
) {
  const step = NEXT[d.action];
  const note = 'note' in d ? d.note : null;
  await db.$transaction(async (tx) => {
    const r = await tx.eventOrganizer.updateMany({
      where: { accountId, status: { in: step.from } },
      data: { status: step.to, decidedAt: now, decidedByAdminId: adminId, decisionNote: note },
    });
    if (r.count !== 1) {
      throw new ApiError(409, 'WRONG_STATUS', 'This organizer can’t be changed that way now.');
    }
    await tx.businessNotice.create({
      data: {
        accountId,
        kind: d.action === 'approve' ? 'ORGANIZER_APPROVED' : 'ORGANIZER_REJECTED',
        title:
          d.action === 'approve'
            ? 'You’re approved as an event organizer'
            : d.action === 'reject'
              ? 'Your organizer request was turned down'
              : 'Your organizer approval was taken back',
        body: d.action === 'approve' ? 'You can now send events for review.' : note,
        link: '/events',
        createdAt: now,
      },
    });
  });
}
