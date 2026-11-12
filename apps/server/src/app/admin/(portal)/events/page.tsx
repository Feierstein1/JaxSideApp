import { ADMIN_EVENT_TABS, adminListEvents, type AdminEventTab } from '@/server/events/admin';
import { pageNumber } from '@/server/admin/paging';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { hrefWith, Pager, Pill, Table, Tabs, td, when, words } from '../admin-table';

export const dynamic = 'force-dynamic';

const TAB_LABELS: Record<AdminEventTab, string> = {
  waiting: 'Waiting for review',
  upcoming: 'Upcoming',
  past: 'Past',
  closed: 'Denied and removed',
};

/**
 * D230: the event calendar. Add events (yours are approved at once, so the calendar can be
 * filled before launch); review the website's business and organizer events under Waiting
 * (app users don't suggest events, D233).
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab: AdminEventTab =
    sp.tab && sp.tab in ADMIN_EVENT_TABS ? (sp.tab as AdminEventTab) : 'waiting';
  const q = (sp.q ?? '').trim().slice(0, 60);
  const list = await adminListEvents({ tab, q: q || undefined, page: pageNumber(sp.page) });
  const params = { tab, q };
  return (
    <>
      <h1>Events</h1>
      <p style={ui.muted}>
        Everything on the app’s event calendar. Events you add here show at once; events from
        businesses and organizers on the business website wait here for review.
      </p>
      <p>
        <a href="/admin/events/new" style={{ ...ui.button, textDecoration: 'none' }}>
          Add an event
        </a>
      </p>
      <Tabs
        items={(Object.keys(TAB_LABELS) as AdminEventTab[]).map((t) => ({
          href: hrefWith('/admin/events', { q }, { tab: t }),
          label: TAB_LABELS[t],
          on: t === tab,
        }))}
      />
      <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="hidden" name="tab" value={tab} />
        <input
          style={{ ...ui.input, margin: 0, maxWidth: 360 }}
          name="q"
          defaultValue={q}
          placeholder="Event title"
          aria-label="Event title"
        />
        <button style={ui.button} type="submit">
          Search
        </button>
      </form>
      {list.total === 0 ? (
        <p style={ui.muted}>{q ? `No events match “${q}”.` : 'Nothing here.'}</p>
      ) : (
        <Table head={['Event', 'Where', 'First date', 'Dates', 'Following', 'From', 'Status']}>
          {list.rows.map((e) => (
            <tr key={e.id}>
              <td style={td}>
                <a href={`/admin/events/${e.id}`}>{e.title}</a>
                {e.images ? null : <div style={ui.muted}>No picture</div>}
              </td>
              <td style={td}>
                {e.where}
                {e.neighborhood ? (
                  <div style={ui.muted}>
                    {e.neighborhood}
                    {e.zip ? ` · ${e.zip}` : ''}
                  </div>
                ) : null}
              </td>
              <td style={td}>{e.firstStartsAt ? when(e.firstStartsAt) : '—'}</td>
              <td style={td}>{e.sessions}</td>
              <td style={td}>{e.follows}</td>
              <td style={td}>{e.from}</td>
              <td style={td}>
                <Pill
                  tone={
                    e.status === 'APPROVED'
                      ? 'ok'
                      : e.status === 'REMOVED' || e.status === 'DENIED' || e.status === 'CANCELLED'
                        ? 'alert'
                        : 'muted'
                  }
                >
                  {e.status === 'IN_REVIEW' ? 'in review' : words(e.status)}
                </Pill>
                <Pill>{e.host}</Pill>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={list} base="/admin/events" params={params} />
    </>
  );
}
