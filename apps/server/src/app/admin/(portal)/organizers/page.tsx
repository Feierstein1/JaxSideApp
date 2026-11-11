import type { OrganizerStatus } from '@/generated/prisma/client';
import { pageNumber } from '@/server/admin/paging';
import { adminListOrganizers } from '@/server/events/organizers';
import { ui } from '../../admin-ui';
import { OrganizerDecision } from '../../event-forms';
import { requireAdminPage } from '../../require-admin-page';
import { hrefWith, Pager, Table, Tabs, td, when } from '../admin-table';

export const dynamic = 'force-dynamic';

const TABS: { status: OrganizerStatus; label: string }[] = [
  { status: 'PENDING', label: 'Waiting' },
  { status: 'VERIFIED', label: 'Approved' },
  { status: 'REJECTED', label: 'Turned down' },
  { status: 'REVOKED', label: 'Taken back' },
];

/**
 * D230: event organizers (festivals, nonprofits, promoters) who signed up on the business
 * website. They have no Google listing to verify, so check them here (their website, a call)
 * before they can send events. Their name shows on their events as "Hosted by".
 */
export default async function OrganizersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = (TABS.find((t) => t.status === sp.status)?.status ?? 'PENDING') as OrganizerStatus;
  const list = await adminListOrganizers(status, pageNumber(sp.page));
  return (
    <>
      <h1>Event organizers</h1>
      <p style={ui.muted}>
        People who put on events without a storefront. Check who they are (their website, a call to
        the number they gave) before approving. Approved organizers can send events for review.
      </p>
      <Tabs
        items={TABS.map((t) => ({
          href: hrefWith('/admin/organizers', {}, { status: t.status }),
          label: t.label,
          on: t.status === status,
        }))}
      />
      {list.total === 0 ? (
        <p style={ui.muted}>Nothing here.</p>
      ) : (
        <Table head={['Organizer', 'Contact', 'About', 'Events', 'Since', '']}>
          {list.rows.map((o) => (
            <tr key={o.accountId}>
              <td style={td}>
                <strong>{o.name}</strong>
                <div style={ui.muted}>{o.email ?? ''}</div>
                {o.website ? <div style={ui.muted}>{o.website}</div> : null}
              </td>
              <td style={td}>
                {o.contactName}
                {o.contactPhone ? <div style={ui.muted}>{o.contactPhone}</div> : null}
              </td>
              <td style={td}>
                {o.about ?? ''}
                {o.decisionNote ? <div style={ui.muted}>Note: {o.decisionNote}</div> : null}
              </td>
              <td style={td}>{o.events}</td>
              <td style={td}>{when(o.createdAt)}</td>
              <td style={td}>
                <OrganizerDecision accountId={o.accountId} status={o.status} />
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={list} base="/admin/organizers" params={{ status }} />
    </>
  );
}
