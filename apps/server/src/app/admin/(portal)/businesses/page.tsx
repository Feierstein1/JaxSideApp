import { listBusinesses } from '@/server/admin/businesses';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { Pill, Table, td, when, words } from '../admin-table';

export const dynamic = 'force-dynamic';

/**
 * B1.7 / D172: business accounts (the business website's owners). Employees are listed
 * on their owner's page. Search by business email or place name.
 */
export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminPage();
  const q = ((await searchParams).q ?? '').slice(0, 80);
  const rows = await listBusinesses(q);
  return (
    <>
      <h1>Businesses</h1>
      <p style={ui.muted}>
        Owner accounts on the business website. A business account is separate from the
        owner&rsquo;s personal app account; the place&rsquo;s verified claim links the two.
      </p>
      <form method="get" style={{ display: 'flex', gap: 10, maxWidth: 480 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Business email or place name"
          style={{ ...ui.input, margin: 0 }}
        />
        <button style={ui.button}>Search</button>
      </form>
      <div style={{ marginTop: 16 }}>
        {rows.length === 0 ? <p style={ui.muted}>No business accounts found.</p> : null}
        {rows.length ? (
          <Table
            head={['Business email', 'Status', 'Places', 'Staff', 'Plan', 'Last sign-in', 'Joined']}
          >
            {rows.map((b) => (
              <tr key={b.id}>
                <td style={td}>
                  <a href={`/admin/businesses/${b.id}`}>{b.email}</a>
                </td>
                <td style={td}>
                  <Pill tone={b.status === 'ACTIVE' ? 'ok' : 'alert'}>{words(b.status)}</Pill>
                </td>
                <td style={td}>{b.places.map((p) => p.name).join(', ') || '—'}</td>
                <td style={td}>{b.employees}</td>
                <td style={td}>
                  {b.plan ? `${b.plan.name}${b.plan.comped ? ' (free promo)' : ''}` : '—'}
                </td>
                <td style={td}>{b.lastSignInAt ? when(b.lastSignInAt) : 'never'}</td>
                <td style={td}>{when(b.createdAt)}</td>
              </tr>
            ))}
          </Table>
        ) : null}
      </div>
    </>
  );
}
