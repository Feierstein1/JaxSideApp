import type { ReactNode } from 'react';
import { COLORS } from '@jax/shared';
import { healthDashboard } from '@/server/health';
import { ui } from '../admin-ui';
import { Pill, StatGrid, StatTile, Table, td, when } from './admin-table';

/** D275: friendlier names for the server's containers. */
const CONTAINER: Record<string, string> = {
  'jaxside-app-1': 'App (api.jaxside.com)',
  'jaxside-web-jaxside-web-1': 'Website (jaxside.com)',
  'jaxside-postgres-1': 'Database',
  'jaxside-caddy-1': 'Web server (Caddy)',
};

const MB = 1024 * 1024;
const mb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`);
const bytes = (n: number) => mb(n / MB);
const usd = (n: number) => `$${n.toFixed(2)}`;
/** "+12 MB a week", "not growing", or a dash without enough history. */
const growth = (perWeek: number | null, unit: (n: number) => string) =>
  perWeek === null
    ? 'not enough history yet'
    : perWeek <= 0
      ? 'not growing'
      : `+${unit(perWeek)} a week`;
const hoursSince = (iso: string) => (Date.now() - Date.parse(iso)) / 3_600_000;

function Sub({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 400, color: COLORS.textMuted, marginTop: 4 }}>
      {children}
    </div>
  );
}

function Value({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <>
      {main}
      {sub ? <Sub>{sub}</Sub> : null}
    </>
  );
}

/**
 * D275: the Server health section of the dashboard. Read from the snapshots the server writes
 * every 10 minutes; the most important first (is it up, did the backup work), then what runs
 * out (disk, memory), then sizes, averages and the cost estimate.
 */
export async function ServerHealth() {
  const h = await healthDashboard();
  const s = h.latest;
  if (!s) {
    return (
      <section>
        <h2>Server health</h2>
        <p style={ui.muted}>
          No snapshot from the server yet. They start once the next deploy installs the health job
          (every 10 minutes).
        </p>
      </section>
    );
  }
  const diskLeft = s.diskTotalMb - s.diskUsedMb;
  const diskPct = Math.round((s.diskUsedMb / s.diskTotalMb) * 100);
  const backup = h.jobs.backup;
  const maint = h.jobs.maintenance;
  const jobTile = (j: typeof backup, label: string, maxHours = 26) => {
    const stale = !j.lastGoodAt || hoursSince(j.lastGoodAt) > maxHours;
    return (
      <StatTile
        label={label}
        alert={j.lastOk === false || stale}
        value={
          <Value
            main={j.lastGoodAt ? when(j.lastGoodAt) : 'None yet'}
            sub={
              j.lastOk === false
                ? `Last run failed${j.lastAt ? ` (${when(j.lastAt)})` : ''}`
                : j.lastGoodAt
                  ? `Worked, ${Math.round(hoursSince(j.lastGoodAt))} h ago`
                  : 'Recorded from the next run'
            }
          />
        }
      />
    );
  };

  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>Server health</h2>
      <p style={{ ...ui.muted, marginTop: 0 }}>
        Updated {when(s.takenAt)} (every 10 minutes).{' '}
        {!s.fresh ? (
          <Pill tone="alert">Out of date: the collector on the server may have stopped</Pill>
        ) : null}
      </p>

      {h.alerts.length ? (
        <div
          role="alert"
          style={{
            ...ui.card,
            borderColor: COLORS.error,
            background: COLORS.errorSoft,
            marginBottom: 16,
          }}
        >
          <strong>
            {h.alerts.length} problem{h.alerts.length === 1 ? '' : 's'} right now
          </strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {h.alerts.map((a) => (
              <li key={a.key}>
                {a.detail} <span style={ui.muted}>(since {when(a.since)})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <StatGrid min={200}>
        <StatTile
          label="App (api.jaxside.com)"
          alert={!s.appUp}
          value={<Value main={s.appUp ? 'Up' : 'Down'} />}
        />
        <StatTile
          label="Website (jaxside.com)"
          alert={!s.webUp}
          value={<Value main={s.webUp ? 'Up' : 'Down'} />}
        />
        <StatTile
          label="Database"
          value={<Value main="Up" sub={`${bytes(s.dbBytes)} of data`} />}
        />
        {jobTile(backup, 'Last good backup')}
        {jobTile(maint, 'Last nightly maintenance')}
      </StatGrid>

      <StatGrid min={240}>
        <StatTile
          label="Server disk left"
          alert={diskPct >= 80}
          value={
            <Value
              main={`${mb(diskLeft)} of ${mb(s.diskTotalMb)}`}
              sub={
                <>
                  {diskPct}% used · {growth(h.growthPerWeek.diskMb, mb)}
                  {h.daysToFull !== null ? (
                    <>
                      {' '}
                      · full in about{' '}
                      {h.daysToFull > 120
                        ? `${Math.round(h.daysToFull / 30)} months`
                        : `${h.daysToFull} days`}
                    </>
                  ) : null}
                </>
              }
            />
          }
        />
        <StatTile
          label="Server memory available"
          alert={s.memAvailableMb < 400}
          value={
            <Value
              main={`${mb(s.memAvailableMb)} of ${mb(s.memTotalMb)}`}
              sub={
                <>
                  Average:{' '}
                  {h.averages.week.memAvailableMb !== null
                    ? mb(h.averages.week.memAvailableMb)
                    : '–'}{' '}
                  (7 days),{' '}
                  {h.averages.month.memAvailableMb !== null
                    ? mb(h.averages.month.memAvailableMb)
                    : '–'}{' '}
                  (30 days) · swap in use {mb(s.swapUsedMb)}
                </>
              }
            />
          }
        />
        <StatTile
          label="Server load (15 minutes)"
          value={
            <Value
              main={s.load15.toFixed(2)}
              sub={
                <>
                  Average {h.averages.week.load15?.toFixed(2) ?? '–'} (7 days),{' '}
                  {h.averages.month.load15?.toFixed(2) ?? '–'} (30 days) · 1.00 = one processor
                  fully busy (it has 2)
                </>
              }
            />
          }
        />
      </StatGrid>

      <h3 style={{ marginBottom: 6 }}>Memory by part</h3>
      <Table head={['Part', 'Using', 'Its limit', '']}>
        {s.containers.map((c) => {
          const capped = c.limitMb > 0 && c.limitMb < s.memTotalMb - 1;
          const pct = capped ? Math.round((c.memMb / c.limitMb) * 100) : null;
          return (
            <tr key={c.name}>
              <td style={td}>{CONTAINER[c.name] ?? c.name}</td>
              <td style={td}>{mb(c.memMb)}</td>
              <td style={td}>{capped ? mb(c.limitMb) : 'shares the server’s memory'}</td>
              <td style={td}>
                {pct !== null ? <Pill tone={pct >= 90 ? 'alert' : 'muted'}>{pct}%</Pill> : null}
              </td>
            </tr>
          );
        })}
      </Table>

      <h3 style={{ marginBottom: 6 }}>Storage</h3>
      <StatGrid min={220}>
        <StatTile
          label="Database"
          value={<Value main={bytes(s.dbBytes)} sub={growth(h.growthPerWeek.dbBytes, bytes)} />}
        />
        <StatTile
          label="Pictures and videos (S3)"
          value={
            h.s3 ? (
              <Value
                main={bytes(h.s3.mediaBytes)}
                sub={`${h.s3.mediaObjects.toLocaleString('en-US')} files · ${growth(h.growthPerWeek.s3MediaBytes, bytes)}`}
              />
            ) : (
              <Value main="–" sub="Measured once a day (3:45 am)" />
            )
          }
        />
        <StatTile
          label="Backups (S3, kept 14 days)"
          value={
            h.s3 ? (
              <Value
                main={bytes(h.s3.backupsBytes)}
                sub={`${h.s3.backupsObjects.toLocaleString('en-US')} files · ${growth(h.growthPerWeek.s3BackupsBytes, bytes)}`}
              />
            ) : (
              <Value main="–" sub="Measured once a day (3:45 am)" />
            )
          }
        />
      </StatGrid>
      {h.growthPerWeek.overDays < 7 ? (
        <p style={{ ...ui.muted, marginTop: -12 }}>
          Growth is measured over {h.growthPerWeek.overDays} days so far; it settles after a week.
        </p>
      ) : null}

      <h3 style={{ marginBottom: 6 }}>Running costs this month (estimate)</h3>
      <StatGrid min={180}>
        <StatTile label="Server (Lightsail plan)" value={usd(h.cost.server)} />
        <StatTile label="S3 storage" value={usd(h.cost.s3)} />
        <StatTile
          label="Email (Amazon SES)"
          value={
            <Value
              main={usd(h.cost.email)}
              sub={`${h.cost.emailsThisMonth.toLocaleString('en-US')} sent this month`}
            />
          }
        />
        <StatTile label="Total (estimate)" value={usd(h.cost.total)} />
      </StatGrid>
      <p style={{ ...ui.muted, marginTop: -12 }}>
        From the prices in Settings (<code>costs.*</code>); the AWS bill is the real number. Not
        counted: data transfer and the backups’ own requests, usually cents.
      </p>
    </section>
  );
}
