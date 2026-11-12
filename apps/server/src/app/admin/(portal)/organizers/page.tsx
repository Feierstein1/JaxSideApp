import type { OrganizerStatus } from '@/generated/prisma/client';
import { pageNumber } from '@/server/admin/paging';
import { adminListOrganizers } from '@/server/events/organizers';
import { ui } from '../../admin-ui';
import { OrganizerDecision } from '../../event-forms';
import { requireAdminPage } from '../../require-admin-page';
import { hrefWith, Pager, Table, Tabs, td, when } from '../admin-table';

export const dynamic = 'force-dynamic';

const TABS: { key: string; statuses: OrganizerStatus[]; label: string }[] = [
  { key: 'new', statuses: ['PENDING'], label: 'Not checked yet' },
  { key: 'checked', statuses: ['VERIFIED'], label: 'Checked' },
  { key: 'closed', statuses: ['REJECTED', 'REVOKED'], label: 'Closed' },
];

/**
 * D230 / D237: event organizers (festivals, nonprofits, promoters) who signed up on the
 * business website. They don't wait for JaxSide: they send events at once and every event is
 * reviewed. Checking them is optional (a tick); closing one stops it making or sending events.
 */
export default async function OrganizersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0]!;
  const list = await adminListOrganizers(tab.statuses, pageNumber(sp.page));
  return (
    <>
      <h1>Event organizers</h1>
      <p style={ui.muted}>
        People who put on events without a storefront. They can send events as soon as they sign up,
        and every event is reviewed. Ticking one as checked is optional (their website, a call to
        the number they gave). Closing one stops it making or sending events; it sees your note.
      </p>
      <Tabs
        items={TABS.map((t) => ({
          href: hrefWith('/admin/organizers', {}, { tab: t.key }),
          label: t.label,
          on: t.key === tab.key,
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
      <Pager page={list} base="/admin/organizers" params={{ tab: tab.key }} />
    </>
  );
}
