import { getAdStats, interestShare, type AdNumbers } from '@/server/admin/ad-stats';
import { pageNumber } from '@/server/admin/paging';
import { uuidParam } from '@/server/admin/params';
import { ui } from '../../../admin-ui';
import { requireAdminPage } from '../../../require-admin-page';
import { Pager, Pill, StatGrid, StatTile, Table, td, when, words } from '../../admin-table';

export const dynamic = 'force-dynamic';

const n = (v: number) => v.toLocaleString('en-US');
const share = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);

/** D210: one ad's results: totals for 30 days and all time, then day by day. */
export default async function AdStatsPage(ctx: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const id = await uuidParam(ctx);
  const s = await getAdStats(id, pageNumber((await ctx.searchParams).page));
  const a = s.ad;
  const tiles = (label: string, t: AdNumbers) => (
    <>
      <StatTile label={`Views, ${label}`} value={n(t.views)} />
      <StatTile label={`Interested, ${label}`} value={n(t.interested)} />
      <StatTile label={`Not interested, ${label}`} value={n(t.notInterested)} />
      <StatTile label={`Interested %, ${label}`} value={share(interestShare(t))} />
    </>
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <a href={a.status === 'APPROVED' ? '/admin/ads?tab=live' : '/admin/ads?tab=past'}>← Ads</a>
      <div style={ui.card}>
        <p style={{ marginTop: 0 }}>
          <Pill tone={a.status === 'APPROVED' ? 'ok' : 'muted'}>{words(a.status)}</Pill>
          <Pill>{words(a.template)}</Pill>
          {a.adultsOnly ? <Pill tone="alert">21+</Pill> : null} <strong>{a.place.name}</strong>
          <span style={ui.muted}> · {a.place.address ?? ''}</span>
        </p>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {a.imageUrl ? (
            <img
              src={a.imageUrl}
              alt="The ad’s image"
              style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, objectFit: 'contain' }}
            />
          ) : null}
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ margin: '0 0 6px' }}>{a.headline}</h1>
            {a.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p> : null}
            <p style={ui.muted}>
              Runs {a.schedule}
              {a.startsAt ? ` · from ${when(a.startsAt)}` : ''}
              {a.endsAt ? ` · until ${when(a.endsAt)}` : ''}
              <br />
              Shown to: {a.reach}
              <br />
              From <a href={`/admin/businesses/${a.business.id}`}>{a.business.email}</a>
              {a.approvedAt ? ` · approved ${when(a.approvedAt)}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2>Last 30 days</h2>
        <StatGrid min={170}>{tiles('30 days', s.last30Days)}</StatGrid>
        <h2>All time</h2>
        <StatGrid min={170}>{tiles('all time', s.allTime)}</StatGrid>
      </div>

      <div>
        <h2>Day by day</h2>
        {s.days.total === 0 ? (
          <p style={ui.muted}>No views or answers yet.</p>
        ) : (
          <>
            <Table head={['Day', 'Views', 'Interested', 'Not interested', 'Interested %']}>
              {s.days.rows.map((d) => (
                <tr key={d.day}>
                  <td style={td}>
                    {new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td style={td}>{n(d.views)}</td>
                  <td style={td}>{n(d.interested)}</td>
                  <td style={td}>{n(d.notInterested)}</td>
                  <td style={td}>{share(interestShare(d))}</td>
                </tr>
              ))}
            </Table>
            <Pager page={s.days} base={`/admin/ads/${a.id}`} params={{}} />
          </>
        )}
        <p style={ui.muted}>
          A view is the ad on screen for a second, counted once per person per day. Interested / Not
          interested is one answer per signed-in person. JaxSide doesn’t keep who saw an ad.
        </p>
      </div>
    </div>
  );
}
