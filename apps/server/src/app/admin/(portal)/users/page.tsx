import { searchUsers } from '@/server/admin/users';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { Pill, Table, td, when, words } from '../admin-table';

export const dynamic = 'force-dynamic';

/** P5.14: find a person by username. */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminPage();
  const q = ((await searchParams).q ?? '').slice(0, 40);
  const users = q ? await searchUsers(q) : [];
  return (
    <>
      <h1>Users</h1>
      <form method="get" style={{ display: 'flex', gap: 10, maxWidth: 480 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Username (start of it)"
          style={{ ...ui.input, margin: 0 }}
        />
        <button style={ui.button}>Search</button>
      </form>
      <div style={{ marginTop: 16 }}>
        {q && users.length === 0 ? <p style={ui.muted}>No one found.</p> : null}
        {users.length ? (
          <Table head={['Username', 'Status', 'Role', 'Joined']}>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={td}>
                  <a href={`/admin/users/${u.id}`}>@{u.username}</a>
                </td>
                <td style={td}>
                  <Pill tone={u.status === 'ACTIVE' ? 'ok' : 'alert'}>{words(u.status)}</Pill>
                </td>
                <td style={td}>{words(u.role)}</td>
                <td style={td}>{when(u.createdAt)}</td>
              </tr>
            ))}
          </Table>
        ) : null}
      </div>
    </>
  );
}
