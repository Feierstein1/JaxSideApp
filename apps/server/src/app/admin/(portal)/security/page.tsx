import { recentSecurityEvents } from '@/server/auth/security-events';
import { requireAdminPage } from '../../require-admin-page';
import { Pager, Table, td, when } from '../admin-table';
import { pageNumber } from '@/server/admin/paging';

export const dynamic = 'force-dynamic';

/** D180: sign-in bursts that were blocked (5 wrong passwords for one account, or 8 from one place, in a minute). */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const { last24h, events } = await recentSecurityEvents(pageNumber((await searchParams).page));
  return (
    <>
      <h1>Security</h1>
      <p>
        Sign-in bursts that were blocked: {last24h} in the last 24 hours. The person was told to
        wait a minute and the owner of the account was emailed (at most once an hour). If one
        account keeps showing up, lock it and ask the owner to reset the password. The place code
        only tells entries apart; it is never an address.
      </p>
      <Table head={['When', 'Kind', 'Account', 'Place code']}>
        {events.rows.map((e) => (
          <tr key={e.id}>
            <td style={td}>{when(e.createdAt)}</td>
            <td style={td}>
              {e.kind === 'LOGIN_BURST_ACCOUNT' ? 'One account' : 'One place, many accounts'}
            </td>
            <td style={td}>
              {e.userId ? (
                <a href={`/admin/users/${e.userId}`}>@{e.username}</a>
              ) : (
                'unknown or none'
              )}
            </td>
            <td style={{ ...td, fontFamily: 'monospace' }}>{e.ipCode}</td>
          </tr>
        ))}
      </Table>
      <Pager page={events} base="/admin/security" params={{}} />
    </>
  );
}
