import { listPromoCodes } from '@/server/admin/promo-codes';
import { ui } from '../../admin-ui';
import { PromoActiveToggle, PromoCodeForm } from '../../promo-forms';
import { requireAdminPage } from '../../require-admin-page';
import { Pill, Table, td, when } from '../admin-table';

export const dynamic = 'force-dynamic';

/**
 * D248: promo codes for businesses. A code gives a plan for some days, up to a number of uses
 * in all; each business can use one code, ever (on the website: "Have a code?").
 */
export default async function PromoCodesPage() {
  await requireAdminPage();
  const codes = await listPromoCodes();
  return (
    <>
      <h1>Promo codes</h1>
      <p style={ui.muted}>
        For businesses only. A code for the plan they&apos;re already trying adds its days;
        otherwise it replaces their free plan for that long, then they move to Free.
      </p>
      <PromoCodeForm />
      <h2>Codes</h2>
      {codes.length === 0 ? (
        <p style={ui.muted}>No codes yet.</p>
      ) : (
        <Table head={['Code', 'Gives', 'Used', 'Ends', 'Used by', '']}>
          {codes.map((c) => (
            <tr key={c.id}>
              <td style={td}>
                <strong>{c.code}</strong> {c.active ? null : <Pill tone="muted">off</Pill>}
                {c.note ? <div style={ui.muted}>{c.note}</div> : null}
              </td>
              <td style={td}>
                {c.plan}, {c.days} days
              </td>
              <td style={td}>
                {c.uses} of {c.maxUses}
              </td>
              <td style={td}>{c.expiresAt ? when(c.expiresAt) : 'No end'}</td>
              <td style={td}>
                {c.redemptions.length === 0
                  ? '—'
                  : c.redemptions.map((r) => (
                      <div key={r.accountId}>
                        <a href={`/admin/businesses/${r.accountId}`}>{r.email ?? r.accountId}</a>{' '}
                        <span style={ui.muted}>{when(r.redeemedAt)}</span>
                      </div>
                    ))}
              </td>
              <td style={td}>
                <PromoActiveToggle id={c.id} active={c.active} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
