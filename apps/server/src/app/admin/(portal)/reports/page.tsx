import { pageNumber } from '@/server/admin/paging';
import { listCases } from '@/server/admin/queue';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { Pager, Pill, Table, td, when, words } from '../admin-table';

export const dynamic = 'force-dynamic';

const KIND = {
  general: 'Area post',
  business: 'Room post',
  comment: 'Comment',
  photo: 'Photo',
  user: 'Profile',
  message: 'Private message',
  topic: 'Topic',
  ad: 'Ad', // D209
};

/** P5.14: open reports, one row per reported item, most urgent first. */
export default async function ReportsQueue({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const list = await listCases({ page: pageNumber((await searchParams).page) });
  const cases = list.rows;
  return (
    <>
      <h1>Reports</h1>
      {list.total === 0 ? (
        <p style={ui.muted}>Nothing waiting.</p>
      ) : (
        <Table head={['Item', 'Content', 'Author', 'Reasons', 'Reports', 'Since']}>
          {cases.map((c) => (
            <tr key={`${c.type}:${c.id}`}>
              <td style={td}>
                <a href={`/admin/cases/${c.type}/${c.id}`}>{KIND[c.type]}</a>
                {c.contentStatus === 'HELD_FOR_REVIEW' ? (
                  <div>
                    <Pill tone="alert">Held</Pill>
                  </div>
                ) : null}
                {c.automatic ? (
                  <div>
                    <Pill>Automatic</Pill>
                  </div>
                ) : null}
                {c.fromBusiness ? (
                  <div>
                    <Pill>Business report</Pill>
                  </div>
                ) : null}
              </td>
              <td style={{ ...td, maxWidth: 380 }}>{c.preview}</td>
              <td style={td}>
                {c.author && 'username' in c.author ? (
                  <a href={`/admin/users/${c.author.id}`}>@{c.author.username}</a>
                ) : c.author && 'business' in c.author ? (
                  `Business (${c.author.signInName})`
                ) : c.author ? (
                  'GUEST'
                ) : (
                  '—'
                )}
              </td>
              <td style={td}>
                {c.reasons.map((r) => (
                  <Pill key={r} tone={r === 'CHILD_SAFETY' || r === 'THREAT' ? 'alert' : 'muted'}>
                    {words(r)}
                  </Pill>
                ))}
              </td>
              <td style={td}>{c.reportCount}</td>
              <td style={td}>{when(c.firstReportedAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={list} base="/admin/reports" params={{}} />
    </>
  );
}
