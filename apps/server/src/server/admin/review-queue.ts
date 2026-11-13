import { REVIEW_KINDS, type ReviewKind } from '@jax/shared';
import { db } from '../db';

/*
 * D242: one list of everything waiting for JaxSide, oldest sent first, so the review work can
 * be done in one place. Each row links to the page where it's decided (those pages stay).
 * Jacksonville-sized: each kind is read whole (at most `PER_KIND`), then merged.
 */

const PER_KIND = 500;
export const REVIEW_PAGE_SIZE = 50;

export interface ReviewItem {
  kind: ReviewKind;
  id: string;
  title: string;
  detail: string | null;
  from: string | null;
  sentAt: string;
  href: string;
}

async function load(): Promise<ReviewItem[]> {
  const [places, events, ads, organizers, placeChanges, names] = await Promise.all([
    db.businessVerificationRequest.findMany({
      where: { status: 'PENDING' },
      take: PER_KIND,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        placeName: true,
        placeId: true,
        createdAt: true,
        account: { select: { email: true } },
      },
    }),
    db.event.findMany({
      where: { status: { in: ['IN_REVIEW', 'SUGGESTED'] } },
      take: PER_KIND,
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        hostKind: true,
        submittedAt: true,
        createdAt: true,
        businessAccount: { select: { email: true } },
      },
    }),
    db.ad.findMany({
      where: { status: 'PENDING_REVIEW' },
      take: PER_KIND,
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        headline: true,
        submittedAt: true,
        createdAt: true,
        eventId: true,
        place: { select: { name: true } },
        account: { select: { email: true } },
      },
    }),
    db.eventOrganizer.findMany({
      where: { status: 'PENDING' },
      take: PER_KIND,
      orderBy: { createdAt: 'asc' },
      select: {
        accountId: true,
        name: true,
        createdAt: true,
        account: { select: { email: true } },
      },
    }),
    db.placeChangeRequest.findMany({
      where: { status: 'PENDING' },
      take: PER_KIND,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        address: true,
        latitude: true,
        createdAt: true,
        place: { select: { name: true } },
        account: { select: { email: true } },
      },
    }),
    db.organizerNameRequest.findMany({
      where: { status: 'PENDING' },
      take: PER_KIND,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        currentName: true,
        name: true,
        createdAt: true,
        account: { select: { email: true } },
      },
    }),
  ]);
  const what = (c: (typeof placeChanges)[number]) =>
    [
      c.name ? `name → ${c.name}` : null,
      c.category ? `category → ${c.category}` : null,
      c.address ? 'address' : null,
      c.latitude !== null ? 'pin' : null,
    ]
      .filter(Boolean)
      .join(', ');
  return [
    ...places.map((r) => ({
      kind: 'place' as const,
      id: r.id,
      title: r.placeName,
      detail: r.placeId ? 'Verify an owner' : 'Add a new place',
      from: r.account.email,
      sentAt: r.createdAt.toISOString(),
      href: '/admin/owners',
    })),
    ...events.map((e) => ({
      kind: 'event' as const,
      id: e.id,
      title: e.title,
      detail:
        e.hostKind === 'BUSINESS'
          ? 'Business event'
          : e.hostKind === 'ORGANIZER'
            ? 'Organizer event'
            : 'Suggested',
      from: e.businessAccount?.email ?? null,
      sentAt: (e.submittedAt ?? e.createdAt).toISOString(),
      href: `/admin/events/${e.id}`,
    })),
    ...ads.map((a) => ({
      kind: 'ad' as const,
      id: a.id,
      title: a.headline,
      detail: a.eventId ? 'Event ad' : (a.place?.name ?? null),
      from: a.account.email,
      sentAt: (a.submittedAt ?? a.createdAt).toISOString(),
      href: '/admin/ads',
    })),
    ...organizers.map((o) => ({
      kind: 'organizer' as const,
      id: o.accountId,
      title: o.name,
      detail: 'Not checked yet (optional)',
      from: o.account.email,
      sentAt: o.createdAt.toISOString(),
      href: '/admin/organizers',
    })),
    ...placeChanges.map((c) => ({
      kind: 'placeChange' as const,
      id: c.id,
      title: c.place.name,
      detail: what(c),
      from: c.account.email,
      sentAt: c.createdAt.toISOString(),
      href: '/admin/changes',
    })),
    ...names.map((n) => ({
      kind: 'organizerName' as const,
      id: n.id,
      title: n.currentName,
      detail: `→ ${n.name}`,
      from: n.account.email,
      sentAt: n.createdAt.toISOString(),
      href: '/admin/changes',
    })),
  ];
}

/** The queue (oldest sent first), one page of it, and how many of each kind are waiting. */
export async function reviewQueue(opts: { kind?: ReviewKind; page?: number } = {}) {
  const all = await load();
  const counts = Object.fromEntries(
    REVIEW_KINDS.map((k) => [k, all.filter((i) => i.kind === k).length]),
  ) as Record<ReviewKind, number>;
  const rows = (opts.kind ? all.filter((i) => i.kind === opts.kind) : all).sort(
    (a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
  );
  const page = Math.max(1, opts.page ?? 1);
  return {
    counts,
    total: rows.length,
    page,
    pages: Math.max(1, Math.ceil(rows.length / REVIEW_PAGE_SIZE)),
    rows: rows.slice((page - 1) * REVIEW_PAGE_SIZE, page * REVIEW_PAGE_SIZE),
  };
}
