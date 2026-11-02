import { listPlans } from '@/server/admin/plans';
import { ui } from '../../../admin-ui';
import { PlanForm } from '../../../business-forms';
import { requireAdminPage } from '../../../require-admin-page';
import { Pill, Table, td } from '../../admin-table';

export const dynamic = 'force-dynamic';

const price = (cents: number | null) =>
  cents === null ? 'not set' : `$${(cents / 100).toFixed(2)} / month`;

/**
 * B3.1 / D168: subscription plans. Any number of tiers; changes apply to everyone on the
 * plan. Prices are for later (no payments yet, B4): today plans are given for free.
 */
export default async function PlansPage() {
  await requireAdminPage();
  const plans = await listPlans();
  return (
    <>
      <p>
        <a href="/admin/businesses">← Businesses</a>
      </p>
      <h1>Plans</h1>
      <p style={ui.muted}>
        A plan sets how many ads a business can run at once (up to 3) and whether it includes area
        counts. Give a business a plan from its page. Changing a plan here changes it for everyone
        on it.
      </p>
      {plans.length === 0 ? <p style={ui.muted}>No plans yet.</p> : null}
      {plans.length ? (
        <Table head={['Plan', 'Ads at once', 'Area counts', 'Price', 'Businesses on it', 'Edit']}>
          {plans.map((p) => (
            <tr key={p.id}>
              <td style={td}>
                {p.name} {p.active ? null : <Pill>not offered</Pill>}
              </td>
              <td style={td}>{p.liveAdLimit}</td>
              <td style={td}>{p.includesInsights ? 'yes' : 'no'}</td>
              <td style={td}>{price(p.priceCents)}</td>
              <td style={td}>{p.activeSubscriptions}</td>
              <td style={td}>
                <PlanForm plan={p} />
              </td>
            </tr>
          ))}
        </Table>
      ) : null}
      <div style={{ ...ui.card, marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>New plan</h2>
        <PlanForm />
      </div>
    </>
  );
}
