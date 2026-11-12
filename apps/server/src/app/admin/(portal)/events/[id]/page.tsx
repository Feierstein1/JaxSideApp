import { notFound } from 'next/navigation';
import { z } from 'zod';
import type { EventCategory, EventSetting } from '@jax/shared';
import { adminGetEvent } from '@/server/events/admin';
import { ApiError } from '@/server/http';
import { ui } from '../../../admin-ui';
import { EventCopyButtons, EventDecision, EventForm, EventImages } from '../../../event-forms';
import { requireAdminPage } from '../../../require-admin-page';
import { Pill, when, words } from '../../admin-table';

export const dynamic = 'force-dynamic';

const STATUS_NOTE: Record<string, string> = {
  SUGGESTED:
    'An app user suggested this before suggestions were turned off (D233). Set its place or pin and check the details (Edit), then approve it, or deny it.',
  IN_REVIEW: 'Waiting for review. It shows in the app once you approve it.',
  DRAFT: 'The business is still writing this on the website. Nobody sees it yet.',
  APPROVED: 'On the calendar.',
  DENIED: 'Denied. The business (or the suggester) can see why.',
  CANCELLED: 'Cancelled: still listed, marked Cancelled, until its dates pass.',
  REMOVED: 'Removed by moderation. Nobody sees it.',
};

/** D230: one event: review it, edit it, its pictures, Duplicate and Repeat yearly. */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const e = await adminGetEvent(id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const created = (await searchParams).created === '1';
  return (
    <>
      <p>
        <a href="/admin/events">← Events</a>
      </p>
      <h1>{e.title}</h1>
      {created ? (
        <p role="status" style={{ fontWeight: 600 }}>
          Added. It’s on the calendar now. Add a picture below if you have one.
        </p>
      ) : null}
      <p>
        <Pill tone={e.status === 'APPROVED' ? 'ok' : 'muted'}>{words(e.status)}</Pill>{' '}
        {STATUS_NOTE[e.status] ?? ''}
      </p>
      <p style={ui.muted}>
        {e.neighborhood ? `${e.neighborhood}${e.zip ? ` · ${e.zip}` : ''} · ` : ''}
        {e.follows} following · added {when(e.createdAt)}
        {e.businessAccount ? ` · from the website (${e.businessAccount.email ?? 'business'})` : ''}
        {e.createdBy && e.createdBy.role !== 'ADMIN'
          ? ` · suggested by ${e.createdBy.username}`
          : ''}
      </p>
      {e.decisionReason ? <p>Reason given: {e.decisionReason}</p> : null}
      {e.cancelReason ? <p>Cancelled because: {e.cancelReason}</p> : null}
      <EventCopyButtons id={e.id} />
      <EventForm
        id={e.id}
        initial={{
          hostKind: e.hostKind,
          title: e.title,
          description: e.description,
          category: e.category as EventCategory,
          setting: e.setting as EventSetting,
          free: e.free,
          priceText: e.priceText,
          adultsOnly: e.adultsOnly,
          familyFriendly: e.familyFriendly,
          place: e.place,
          venueName: e.venueName,
          address: e.address,
          latitude: e.latitude,
          longitude: e.longitude,
          chatRadiusMeters: e.chatRadiusMeters,
          sessions: e.sessions,
        }}
      />
      <EventImages id={e.id} images={e.images} />
      <EventDecision id={e.id} status={e.status} />
    </>
  );
}
