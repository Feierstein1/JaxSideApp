import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { ApiError } from '@/server/http';
import { currentPlan } from '@/server/plan';
import { requirePlace } from '@/server/places';
import { TEXT } from '@/text';
import { requireAccount } from '../../../require-account';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });

/** B3.1: the business's plan (Owner only). Payments come later (B4). */
export default async function BillingPage({ params }: { params: Promise<{ placeId: string }> }) {
  const account = await requireAccount();
  const { placeId } = await params;
  let place;
  try {
    place = await requirePlace(account.id, placeId, 'billing');
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const plan = await currentPlan(account);
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <Link href={`/places/${place.id}`}>← {place.name}</Link>
      <h1>{TEXT.billing.title}</h1>
      {plan ? (
        <div
          style={{
            padding: 16,
            background: COLORS.background,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 12,
          }}
        >
          <h2 style={{ marginTop: 0 }}>{plan.name}</h2>
          <ul>
            <li>{TEXT.billing.ads(plan.liveAdLimit)}</li>
            <li>{plan.includesInsights ? TEXT.billing.insightsYes : TEXT.billing.insightsNo}</li>
            <li>
              {plan.comped ? TEXT.billing.free : TEXT.billing.paid}
              {plan.endsAt ? ` ${TEXT.billing.until(day(plan.endsAt))}` : ''}
            </li>
          </ul>
          <p style={{ color: COLORS.textMuted, marginBottom: 0 }}>{TEXT.billing.allPlaces}</p>
        </div>
      ) : (
        <p>{TEXT.billing.none}</p>
      )}
      <p style={{ color: COLORS.textMuted }}>{TEXT.billing.paymentsLater}</p>
    </main>
  );
}
