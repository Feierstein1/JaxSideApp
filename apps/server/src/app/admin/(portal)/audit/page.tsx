import { listAudit } from '@/server/admin/audit';
import { pageNumber } from '@/server/admin/paging';
import { requireAdminPage } from '../../require-admin-page';
import { Pager, Table, td, when, words } from '../admin-table';

export const dynamic = 'force-dynamic';

/** P5.16: who did what, newest first. Read-only. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const entries = await listAudit({ page: pageNumber((await searchParams).page) });
  return (
    <>
      <h1>Audit log</h1>
      <Table head={['When', 'Admin', 'Action', 'Target', 'Details']}>
        {entries.rows.map((e) => (
          <tr key={e.id}>
            <td style={td}>{when(e.createdAt)}</td>
            <td style={td}>@{e.admin}</td>
            <td style={td}>{words(e.action)}</td>
            <td style={td}>
              {e.targetType === 'user' && e.targetId ? (
                <a href={`/admin/users/${e.targetId}`}>user</a>
              ) : (
                `${e.targetType}${e.targetId ? ` ${e.targetId.slice(0, 8)}…` : ''}`
              )}
            </td>
            <td style={{ ...td, fontSize: 12 }}>{e.metadata ? JSON.stringify(e.metadata) : ''}</td>
          </tr>
        ))}
      </Table>
      <Pager page={entries} base="/admin/audit" params={{}} />
    </>
  );
}
