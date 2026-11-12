import { COLORS } from '@jax/shared';
import {
  bounds,
  flowReport,
  MIN_GROUP,
  parsePeriod,
  periods,
  placeReport,
  shown,
  sortRows,
  zipDays,
  zipReport,
  type FlowRow,
  type PlaceRow,
  type ZipRow,
} from '@/server/stats/report';
import { LIVE_PERIODS, isLive, mapCounts, mapShapes, type MapCounts } from '@/server/stats/map';
import { ui } from '../../admin-ui';
import { ZipMap } from '../../zip-map';
import { requireAdminPage } from '../../require-admin-page';
import { Pager, td, th, words } from '../admin-table';
import { pageNumber, slicePage, type Page } from '@/server/admin/paging';

export const dynamic = 'force-dynamic';

type Tab = 'map' | 'zips' | 'places' | 'travel';
const TABS: { key: Tab; label: string }[] = [
  { key: 'map', label: 'Map' },
  { key: 'zips', label: 'ZIP codes' },
  { key: 'places', label: 'Places' },
  { key: 'travel', label: 'Travel between areas' },
];

type Q = {
  tab?: string;
  period?: string;
  sort?: string;
  dir?: string;
  zip?: string;
  page?: string;
};

const avg = (n: number) => (n < MIN_GROUP ? `<${MIN_GROUP}` : n.toFixed(1));
const pct = (part: number, whole: number) =>
  whole >= MIN_GROUP && part >= MIN_GROUP ? `${Math.round((part / whole) * 100)}%` : '—';
const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/**
 * P14.6 (D116): the anonymous area statistics. Counts only: how many people used Jax in each
 * ZIP code (by part of the day, weekday vs weekend, new this month), activity at places, and
 * ZIP pairs people were in on the same day. Groups under 10 people show as "<10".
 */
export default async function StatsPage({ searchParams }: { searchParams: Promise<Q> }) {
  await requireAdminPage();
  const q = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === q.tab)?.key ?? 'zips';
  // D229: the map also offers today, this week and this month so far (counted live).
  const tables = await periods();
  const choices = tab === 'map' ? [...LIVE_PERIODS, ...tables] : tables;
  const period =
    choices.find((p) => p.key === q.period)?.key ?? (tab === 'map' ? 'this-week' : '7d');
  const range = parsePeriod(period);
  const map = tab === 'map' ? await mapCounts(period) : null;
  const { from, to } = map ?? bounds(range);
  const dir = q.dir === 'asc' ? 'asc' : 'desc';
  const link = (over: Partial<Q>) => {
    const p = new URLSearchParams({ tab, period, ...(q.sort ? { sort: q.sort } : {}), dir });
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) p.delete(k);
      else p.set(k, v);
    }
    return `/admin/stats?${p.toString()}`;
  };
  /** A sortable column header. */
  const Head = ({ label, col }: { label: string; col?: string }) =>
    col ? (
      <th style={th}>
        <a
          href={link({
            sort: col,
            dir: q.sort === col && dir === 'desc' ? 'asc' : 'desc',
            zip: undefined,
          })}
          style={{ color: 'inherit' }}
        >
          {label}
          {q.sort === col ? (dir === 'desc' ? ' ▼' : ' ▲') : ''}
        </a>
      </th>
    ) : (
      <th style={th}>{label}</th>
    );

  const pageNo = pageNumber(q.page);
  const pager: PagerT = (rows) => {
    const page = slicePage(rows, pageNo);
    return {
      page,
      nav: (
        <Pager
          page={page}
          base="/admin/stats"
          params={{ tab, period, sort: q.sort, dir: q.sort ? dir : undefined, zip: q.zip }}
        />
      ),
    };
  };
  return (
    <>
      <h1>Area statistics</h1>
      <p style={ui.muted}>
        How many people used Jax in each part of Jacksonville. Counts only: no one’s identity or
        location is stored. Groups under {MIN_GROUP} people show as “&lt;{MIN_GROUP}”.{' '}
        <strong>People per day</strong> adds up each day’s distinct people;{' '}
        <strong>unique people</strong> (each person once) is shown for whole weeks and months.
      </p>

      <nav style={{ display: 'flex', gap: 18, margin: '12px 0' }}>
        {TABS.map((t) => (
          <a
            key={t.key}
            href={link({ tab: t.key, sort: undefined, zip: undefined })}
            style={{ fontWeight: t.key === tab ? 800 : 400 }}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <form
        method="get"
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}
      >
        <input type="hidden" name="tab" value={tab} />
        {q.zip ? <input type="hidden" name="zip" value={q.zip} /> : null}
        <label htmlFor="period">Period</label>
        <select id="period" name="period" defaultValue={period} style={{ padding: 6 }}>
          {choices.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <button type="submit" style={{ ...ui.button, padding: '6px 14px' }}>
          Show
        </button>
        <span style={ui.muted}>
          {fmtDay(from)} – {fmtDay(to)}
        </span>
      </form>

      {map ? (
        <MapView counts={map} period={period} />
      ) : tab === 'zips' && q.zip ? (
        <ZipDetail zip={q.zip} range={range} back={link({ zip: undefined })} pager={pager} />
      ) : tab === 'zips' ? (
        <ZipTable
          rows={sortRows(
            await zipReport(range),
            (q.sort as keyof ZipRow) ?? 'visitorDays',
            q.sort ? dir : 'desc',
          )}
          pager={pager}
          showUnique={range.kind !== 'days'}
          Head={Head}
          zipLink={(zip) => link({ zip })}
        />
      ) : tab === 'places' ? (
        <PlaceTable
          rows={sortRows(
            await placeReport(range),
            (q.sort as keyof PlaceRow) ?? 'posts',
            q.sort ? dir : 'desc',
          )}
          pager={pager}
          Head={Head}
        />
      ) : (
        <TravelTable
          rows={sortRows(
            await flowReport(range),
            (q.sort as keyof FlowRow) ?? 'peopleDays',
            q.sort ? dir : 'desc',
          )}
          pager={pager}
          Head={Head}
        />
      )}
    </>
  );
}

type HeadT = (p: { label: string; col?: string }) => React.ReactElement;
/** D210: one page (20 rows) of an already-sorted table, with its Previous / Next. */
type PagerT = <T>(rows: T[]) => { page: Page<T>; nav: React.ReactElement };

/** D229: the ZIP map; a click opens that ZIP's day-by-day page (finished days only). */
async function MapView({ counts, period }: { counts: MapCounts; period: string }) {
  const shapes = await mapShapes();
  const byZip = Object.fromEntries(counts.zips.map((z) => [z.zip, z]));
  const days = isLive(period) ? '7d' : period;
  return (
    <>
      <ZipMap
        viewBox={shapes.viewBox}
        county={shapes.county}
        zips={shapes.zips}
        counts={byZip}
        measure={counts.measure}
        partsMeasure={counts.partsMeasure}
        zipHref={Object.fromEntries(
          shapes.zips.map((z) => [
            z.zip,
            `/admin/stats?${new URLSearchParams({ tab: 'zips', period: days, zip: z.zip })}`,
          ]),
        )}
      />
      <p style={ui.muted}>
        {counts.measure === 'people'
          ? 'Each person is counted once per ZIP for the period (someone in two ZIPs counts in both).'
          : 'Each day’s distinct people, added up over the period.'}{' '}
        Counted when a signed-in person opens the area feed there; guests and people who turned this
        off in Settings aren’t counted. Sections under {MIN_GROUP} people are gray and never show a
        number. Click a ZIP for its day-by-day numbers.
      </p>
    </>
  );
}

function Empty() {
  return <p style={ui.muted}>No counts for this period yet. They’re added each night.</p>;
}

function ZipTable({
  rows: all,
  pager,
  showUnique,
  Head,
  zipLink,
}: {
  rows: ZipRow[];
  pager: PagerT;
  showUnique: boolean;
  Head: HeadT;
  zipLink: (zip: string) => string;
}) {
  if (!all.length) return <Empty />;
  const { page, nav } = pager(all);
  const rows = page.rows;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Head label="ZIP" col="zip" />
            <Head label="Area" col="area" />
            <Head label="People per day (total)" col="visitorDays" />
            <Head label="Avg per day" col="perDay" />
            {showUnique ? <Head label="Unique people" col="unique" /> : null}
            <Head label="Morning" col="morning" />
            <Head label="Afternoon" col="afternoon" />
            <Head label="Evening" col="evening" />
            <Head label="Night" col="night" />
            <Head label="Weekday avg" col="weekdayAvg" />
            <Head label="Weekend avg" col="weekendAvg" />
            <Head label="New this month" col="newThisMonth" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.zip}>
              <td style={td}>
                <a href={zipLink(r.zip)}>
                  <strong>{r.zip}</strong>
                </a>
              </td>
              <td style={td}>{r.area ?? '—'}</td>
              <td style={num}>{shown(r.visitorDays)}</td>
              <td style={num}>{avg(r.perDay)}</td>
              {showUnique ? <td style={num}>{shown(r.unique)}</td> : null}
              <td style={num}>
                {shown(r.morning)} <small style={ui.muted}>{pct(r.morning, r.visitorDays)}</small>
              </td>
              <td style={num}>
                {shown(r.afternoon)}{' '}
                <small style={ui.muted}>{pct(r.afternoon, r.visitorDays)}</small>
              </td>
              <td style={num}>
                {shown(r.evening)} <small style={ui.muted}>{pct(r.evening, r.visitorDays)}</small>
              </td>
              <td style={num}>
                {shown(r.night)} <small style={ui.muted}>{pct(r.night, r.visitorDays)}</small>
              </td>
              <td style={num}>{avg(r.weekdayAvg)}</td>
              <td style={num}>{avg(r.weekendAvg)}</td>
              <td style={num}>{shown(r.newThisMonth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {nav}
      <p style={ui.muted}>Click a ZIP for its day-by-day counts.</p>
    </div>
  );
}

async function ZipDetail({
  zip,
  range,
  back,
  pager,
}: {
  zip: string;
  range: ReturnType<typeof parsePeriod>;
  back: string;
  pager: PagerT;
}) {
  if (!/^\d{5}$/.test(zip)) return <p>Unknown ZIP.</p>;
  const { page, nav } = pager(await zipDays(zip, range));
  const days = page.rows;
  return (
    <>
      <p>
        <a href={back}>← All ZIP codes</a>
      </p>
      <h2 style={{ marginTop: 0 }}>{zip}, day by day</h2>
      {days.length === 0 ? (
        <Empty />
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              {['Day', 'People', 'Morning', 'Afternoon', 'Evening', 'Night', 'New this month'].map(
                (h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td style={td}>{fmtDay(d.day)}</td>
                <td style={num}>{shown(d.visitors)}</td>
                <td style={num}>{shown(d.morning)}</td>
                <td style={num}>{shown(d.afternoon)}</td>
                <td style={num}>{shown(d.evening)}</td>
                <td style={num}>{shown(d.night)}</td>
                <td style={num}>{shown(d.newThisMonth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {nav}
    </>
  );
}

function PlaceTable({ rows: all, pager, Head }: { rows: PlaceRow[]; pager: PagerT; Head: HeadT }) {
  if (!all.length) return <Empty />;
  const { page, nav } = pager(all);
  const rows = page.rows;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Head label="Place" col="name" />
            <Head label="Category" col="category" />
            <Head label="Posts" col="posts" />
            <Head label="Comments" col="comments" />
            <Head label="People per day (total)" col="peopleDays" />
            <Head label="New favorites" col="favorites" />
            <Head label="Votes" col="votes" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>
                <strong>{r.name}</strong>
              </td>
              <td style={td}>{words(r.category)}</td>
              <td style={num}>{r.posts.toLocaleString('en-US')}</td>
              <td style={num}>{r.comments.toLocaleString('en-US')}</td>
              <td style={num}>{shown(r.peopleDays)}</td>
              <td style={num}>{r.favorites.toLocaleString('en-US')}</td>
              <td style={num}>{r.votes.toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {nav}
      <p style={ui.muted}>
        Posts and comments in a place’s discussion need people within 530 yd of it, so they show
        real visits. Places of worship are never counted.
      </p>
    </div>
  );
}

function TravelTable({ rows, pager, Head }: { rows: FlowRow[]; pager: PagerT; Head: HeadT }) {
  const shownRows = rows.filter((r) => r.peopleDays >= MIN_GROUP);
  if (!shownRows.length) {
    return rows.length ? (
      <p style={ui.muted}>Every pair in this period has fewer than {MIN_GROUP} people.</p>
    ) : (
      <Empty />
    );
  }
  const { page, nav } = pager(shownRows);
  const visible = page.rows;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Head label="ZIP" col="zipA" />
            <Head label="And ZIP" col="zipB" />
            <Head label="People per day (total)" col="peopleDays" />
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={`${r.zipA}-${r.zipB}`}>
              <td style={td}>
                {r.zipA} <small style={ui.muted}>{r.areaA ?? ''}</small>
              </td>
              <td style={td}>
                {r.zipB} <small style={ui.muted}>{r.areaB ?? ''}</small>
              </td>
              <td style={num}>{r.peopleDays.toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {nav}
      <p style={ui.muted}>People who were in both ZIP codes on the same day.</p>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: COLORS.background,
  border: `1px solid ${COLORS.cardBorder}`,
};
const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
