import { listPendingAds } from '@/server/admin/ad-review';
import { AD_RULES } from '@jax/shared';
import { adOverview, adTab, interestShare, listAdsWithStats } from '@/server/admin/ad-stats';
import { pageNumber } from '@/server/admin/paging';
import { ui } from '../../admin-ui';
import { AdDecisionForm } from '../../business-forms';
import { requireAdminPage } from '../../require-admin-page';
import {
  Pager,
  Pill,
  StatGrid,
  StatTile,
  Table,
  Tabs,
  hrefWith,
  td,
  when,
  words,
} from '../admin-table';

export const dynamic = 'force-dynamic';

const n = (v: number) => v.toLocaleString('en-US');
const share = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);

/**
 * B3.3 / D206 / D210: ads. "To review": approve each ad before it shows, or turn it down with
 * a reason the business sees. "Live" and "Paused & ended": how each ad is doing (views and
 * Interested / Not interested, from the daily totals; never who saw it).
 */
export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = adTab(sp.tab);
  const page = pageNumber(sp.page);
  const overview = await adOverview();
  const params = { tab: tab === 'review' ? undefined : tab };
  const tabs = [
    { key: 'review', label: `To review (${n(overview.waiting)})` },
    { key: 'live', label: `Live (${n(overview.live)})` },
    { key: 'past', label: 'Paused & ended' },
  ].map((t) => ({
    href: hrefWith('/admin/ads', {}, { tab: t.key === 'review' ? undefined : t.key }),
    label: t.label,
    on: t.key === tab,
  }));

  return (
    <>
      <h1>Ads</h1>
      <StatGrid min={160}>
        <StatTile label="Live ads" value={n(overview.live)} />
        <StatTile
          label="Waiting for review"
          value={n(overview.waiting)}
          alert={overview.waiting > 0}
        />
        <StatTile label="Views today" value={n(overview.viewsToday)} />
        <StatTile label="Views, last 30 days" value={n(overview.last30Days.views)} />
        <StatTile label="Interested, 30 days" value={n(overview.last30Days.interested)} />
        <StatTile label="Not interested, 30 days" value={n(overview.last30Days.notInterested)} />
      </StatGrid>
      <Tabs items={tabs} />
      {tab === 'review' ? (
        <Review page={page} params={params} />
      ) : (
        <Results tab={tab} page={page} params={params} />
      )}
    </>
  );
}

async function Review({
  page,
  params,
}: {
  page: number;
  params: Record<string, string | undefined>;
}) {
  const ads = await listPendingAds(page);
  return (
    <>
      <p style={ui.muted}>
        Every ad is checked before it shows in the app. Approve it, or turn it down and say what
        needs to change (the business sees your reason).
      </p>
      {ads.total === 0 ? <p style={ui.muted}>Nothing waiting.</p> : null}
      <div style={{ display: 'grid', gap: 16 }}>
        {ads.rows.map((a) => (
          <div key={a.id} style={ui.card}>
            <p style={{ marginTop: 0 }}>
              <Pill>{words(a.template)}</Pill>
              {a.adultsOnly ? <Pill tone="alert">21+</Pill> : null} <strong>{a.place.name}</strong>
              <span style={ui.muted}> · {a.place.address ?? ''}</span>
            </p>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {a.imageUrl ? (
                <img
                  src={a.imageUrl}
                  alt="The ad’s image"
                  style={{ maxWidth: 240, maxHeight: 240, borderRadius: 8, objectFit: 'contain' }}
                />
              ) : null}
              <div style={{ flex: 1, minWidth: 240 }}>
                <h2 style={{ margin: '0 0 6px' }}>{a.headline}</h2>
                {a.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p> : null}
                <p style={ui.muted}>
                  Runs {a.schedule}
                  {a.startsAt ? ` · from ${when(a.startsAt)}` : ''}
                  {a.endsAt ? ` · until ${when(a.endsAt)}` : ''}
                  <br />
                  Shown to: {a.reach}
                  <br />
                  {a.link ? (
                    <>
                      {/* D216: exactly where the button goes; check it opens what the ad says. */}
                      Link button “{a.link.label}” goes to <strong>{a.link.host}</strong>:{' '}
                      <a href={a.link.url} target="_blank" rel="noreferrer noopener nofollow">
                        {a.link.url}
                      </a>
                      <br />
                    </>
                  ) : null}
                  From <a href={`/admin/businesses/${a.business.id}`}>{a.business.email}</a>
                  {a.madeBy ? ` (made by ${a.madeBy})` : ''}
                  {a.submittedAt ? ` · sent ${when(a.submittedAt)}` : ''}
                </p>
              </div>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 650 }}>
                The ad rules (what to check)
              </summary>
              <AdRulesList />
            </details>
            <AdDecisionForm adId={a.id} updatedAt={a.updatedAt} />
          </div>
        ))}
      </div>
      <Pager page={ads} base="/admin/ads" params={params} />
    </>
  );
}

async function Results({
  tab,
  page,
  params,
}: {
  tab: 'live' | 'past';
  page: number;
  params: Record<string, string | undefined>;
}) {
  const ads = await listAdsWithStats(tab, page);
  if (ads.total === 0) {
    return <p style={ui.muted}>{tab === 'live' ? 'No ads are live.' : 'None yet.'}</p>;
  }
  return (
    <>
      <p style={ui.muted}>
        Numbers for the last 30 days (Jacksonville days). A view is the ad on screen for a second,
        once per person per day. “Interested %” is the share of people who answered either way.
      </p>
      <Table
        head={[
          'Ad',
          'Place',
          'Shown to',
          'Views',
          'Interested',
          'Not interested',
          'Interested %',
          'Views, all time',
          tab === 'live' ? 'Approved' : 'Status',
        ]}
      >
        {ads.rows.map((a) => (
          <tr key={a.id}>
            <td style={td}>
              <a href={`/admin/ads/${a.id}`}>{a.headline}</a>
              <div style={ui.muted}>{words(a.template)}</div>
            </td>
            <td style={td}>{a.place.name}</td>
            <td style={td}>{a.reach}</td>
            <td style={td}>{n(a.last30Days.views)}</td>
            <td style={td}>{n(a.last30Days.interested)}</td>
            <td style={td}>{n(a.last30Days.notInterested)}</td>
            <td style={td}>{share(interestShare(a.last30Days))}</td>
            <td style={td}>{n(a.allTime.views)}</td>
            <td style={td}>
              {tab === 'past' ? (
                <Pill>{words(a.status)}</Pill>
              ) : a.approvedAt ? (
                when(a.approvedAt)
              ) : (
                ''
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={ads} base="/admin/ads" params={params} />
    </>
  );
}

/** D207 / D208 / D213: the rules the business agreed to, beside the ad being reviewed. */
function AdRulesList() {
  const list = (title: string, items: readonly string[]) => (
    <>
      <p style={{ fontWeight: 650, margin: '10px 0 4px' }}>{title}</p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
  return (
    <div style={{ fontSize: 14 }}>
      {list('Do', AD_RULES.dos)}
      {list('Photos must be real', AD_RULES.photos)}
      {list('Never allowed', AD_RULES.neverAllowed)}
    </div>
  );
}
