import type { OrganizerStatus } from '@/generated/prisma/client';
import { pageWindow, toPage } from '../admin/paging';
import { db } from '../db';
import { ApiError } from '../http';

/*
 * D230 / D237: event organizers (festivals, nonprofits, promoters). The business website
 * creates the profile when someone signs up as an organizer, and they can send events right
 * away (JaxSide reviews every event). Here JaxSide can tick them as checked, or close them
 * (REJECTED; REVOKED rows are from before D237): a closed organizer can't make or send events
 * on the website, and its name no longer shows as "Hosted by".
 */

export async function adminListOrganizers(statuses: OrganizerStatus[], page = 1) {
  const where = { status: { in: statuses } };
  const status = statuses[0];
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

const NEXT: Record<'approve' | 'reject', { from: OrganizerStatus[]; to: OrganizerStatus }> = {
  approve: { from: ['PENDING', 'REJECTED', 'REVOKED'], to: 'VERIFIED' },
  reject: { from: ['PENDING', 'VERIFIED'], to: 'REJECTED' },
};

/**
 * D237: tick an organizer as checked, close one, or reopen a closed one. Ticking a new one is
 * quiet (they were never waiting); closing and reopening tell them in the website's bell.
 */
export async function adminDecideOrganizer(
  adminId: string,
  accountId: string,
  d: { action: 'approve' } | { action: 'reject'; note: string },
  now = new Date(),
) {
  const step = NEXT[d.action];
  const note = 'note' in d ? d.note : null;
  await db.$transaction(async (tx) => {
    const before = await tx.eventOrganizer.findUnique({
      where: { accountId },
      select: { status: true },
    });
    const r = await tx.eventOrganizer.updateMany({
      where: { accountId, status: { in: step.from } },
      data: { status: step.to, decidedAt: now, decidedByAdminId: adminId, decisionNote: note },
    });
    if (r.count !== 1 || !before) {
      throw new ApiError(409, 'WRONG_STATUS', 'This organizer can’t be changed that way now.');
    }
    if (d.action === 'approve' && before.status === 'PENDING') return;
    await tx.businessNotice.create({
      data: {
        accountId,
        kind: d.action === 'approve' ? 'ORGANIZER_APPROVED' : 'ORGANIZER_REJECTED',
        title:
          d.action === 'approve'
            ? 'Your organizer account is open again'
            : 'Your organizer account was closed',
        body: d.action === 'approve' ? 'You can make and send events for review again.' : note,
        link: '/events',
        createdAt: now,
      },
    });
  });
}
