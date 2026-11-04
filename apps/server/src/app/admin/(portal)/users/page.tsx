import { COLORS } from '@jax/shared';
import { listUsers, parseUserQuery, signupCounts, type UserFilter } from '@/server/admin/users';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { Pill, StatGrid, StatTile, Table, td, when, words } from '../admin-table';

export const dynamic = 'force-dynamic';

const FILTERS: { value: UserFilter; label: string }[] = [
  { value: 'strikes', label: 'With strikes' },
  { value: 'banned', label: 'Banned' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'all', label: 'Everyone' },
];

const SIGNUPS = [
  { key: 'today', label: 'Signed up today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'total', label: 'All accounts' },
] as const;

/** P5.14: find people by any part of the username; strikes, banned and suspended lists. */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const query = parseUserQuery({ get: (k) => sp[k] ?? null });
  const [list, signups] = await Promise.all([listUsers(query), signupCounts()]);
  const link = (patch: Partial<typeof query>) => {
    const next = { ...query, ...patch };
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.filter !== 'strikes') p.set('filter', next.filter);
    if (next.page > 1) p.set('page', String(next.page));
    const s = p.toString();
    return s ? `/admin/users?${s}` : '/admin/users';
  };
  const first = list.total ? (list.page - 1) * list.pageSize + 1 : 0;
  const last = (list.page - 1) * list.pageSize + list.users.length;

  return (
    <>
      <h1>Users</h1>
      <StatGrid min={170}>
        {SIGNUPS.map((s) => (
          <StatTile key={s.key} label={s.label} value={signups[s.key]} />
        ))}
      </StatGrid>

      <div style={{ ...ui.card, padding: 16, marginBottom: 18 }}>
        <nav
          aria-label="Show"
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
        >
          {FILTERS.map((f) => {
            const on = f.value === query.filter;
            return (
              <a
                key={f.value}
                href={link({ filter: f.value, page: 1 })}
                aria-current={on ? 'page' : undefined}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  background: on ? COLORS.primary : COLORS.surfaceMuted,
                  color: on ? COLORS.onPrimary : COLORS.text,
                  border: `1px solid ${on ? COLORS.primary : COLORS.cardBorder}`,
                }}
              >
                {f.label}
              </a>
            );
          })}
        </nav>
        <form method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {query.filter !== 'strikes' ? (
            <input type="hidden" name="filter" value={query.filter} />
          ) : null}
          <input
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Search any part of a username"
            aria-label="Username"
            style={{ ...ui.input, margin: 0, flex: '1 1 260px', width: 'auto' }}
          />
          <button style={ui.button}>Search</button>
          {query.q ? (
            <a href={link({ q: '', page: 1 })} style={{ alignSelf: 'center' }}>
              Clear
            </a>
          ) : null}
        </form>
      </div>

      {list.users.length === 0 ? (
        <p style={ui.muted}>
          {query.q
            ? 'No one found.'
            : query.filter === 'strikes'
              ? 'No one has a strike.'
              : 'No one.'}
        </p>
      ) : (
        <>
          <p style={ui.muted}>
            {first}–{last} of {list.total}
          </p>
          <Table head={['Username', 'Status', 'Strikes', 'Last strike', 'Joined']}>
            {list.users.map((u) => (
              <tr key={u.id}>
                <td style={td}>
                  <a href={`/admin/users/${u.id}`}>@{u.username}</a>
                  {u.role === 'ADMIN' ? <Pill>admin</Pill> : null}
                </td>
                <td style={td}>
                  <Pill tone={u.status === 'ACTIVE' ? 'ok' : 'alert'}>{words(u.status)}</Pill>
                  {u.suspendedUntil ? `until ${when(u.suspendedUntil)}` : ''}
                </td>
                <td style={td}>
                  {u.strikes}
                  {u.strikes ? (
                    <span style={ui.muted}> ({u.countingStrikes} still counting)</span>
                  ) : null}
                </td>
                <td style={td}>{u.lastStrikeAt ? when(u.lastStrikeAt) : ''}</td>
                <td style={td}>{when(u.createdAt)}</td>
              </tr>
            ))}
          </Table>
          {list.pages > 1 ? (
            <nav style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 14 }}>
              {list.page > 1 ? <a href={link({ page: list.page - 1 })}>← Previous</a> : null}
              <span style={ui.muted}>
                Page {list.page} of {list.pages}
              </span>
              {list.page < list.pages ? <a href={link({ page: list.page + 1 })}>Next →</a> : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
