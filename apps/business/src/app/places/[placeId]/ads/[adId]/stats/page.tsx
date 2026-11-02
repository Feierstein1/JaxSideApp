import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { adStats } from '@/server/ad-stats';
import { ApiError } from '@/server/http';
import { TEXT } from '@/text';
import { requireAccount } from '../../../../../require-account';

const n = (v: number | null) => (v === null ? TEXT.insights.fewer : v.toLocaleString('en-US'));

/** B3.5: what an ad did (Owner). Totals only; nothing about who. */
export default async function AdStatsPage({
  params,
}: {
  params: Promise<{ placeId: string; adId: string }>;
}) {
  const account = await requireAccount();
  const { placeId, adId } = await params;
  let s;
  try {
    s = await adStats(account, adId);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  if (s.ad.placeId !== placeId) notFound();
  const box = {
    padding: 14,
    background: COLORS.background,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 12,
  };
  const totals = (label: string, t: typeof s.allTime) => (
    <div style={box}>
      <div style={{ color: COLORS.textMuted, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 15, marginTop: 6 }}>
        <strong>{t.views.toLocaleString('en-US')}</strong> {TEXT.adStats.views} ·{' '}
        <strong>{t.interested.toLocaleString('en-US')}</strong> {TEXT.adStats.interested} ·{' '}
        <strong>{t.notInterested.toLocaleString('en-US')}</strong> {TEXT.adStats.notInterested}
      </div>
    </div>
  );
  const th = { textAlign: 'left' as const, padding: 8, color: COLORS.textMuted, fontSize: 13 };
  const td = { padding: 8, borderTop: `1px solid ${COLORS.cardBorder}` };
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <Link href={`/places/${placeId}/ads/${adId}`}>← {s.ad.headline || TEXT.ads.untitled}</Link>
      <h1>{TEXT.adStats.title}</h1>
      <div style={{ display: 'grid', gap: 10 }}>
        {totals(TEXT.adStats.last30, s.last30Days)}
        {totals(TEXT.adStats.allTime, s.allTime)}
      </div>
      <h2>{TEXT.adStats.byDay}</h2>
      {s.days.length === 0 ? (
        <p style={{ color: COLORS.textMuted }}>{TEXT.adStats.none}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: COLORS.background }}>
          <thead>
            <tr>
              <th style={th}>{TEXT.adStats.day}</th>
              <th style={th}>{TEXT.adStats.views}</th>
              <th style={th}>{TEXT.adStats.interested}</th>
              <th style={th}>{TEXT.adStats.notInterested}</th>
            </tr>
          </thead>
          <tbody>
            {s.days.map((d) => (
              <tr key={d.day}>
                <td style={td}>{d.day}</td>
                <td style={td}>{n(d.views)}</td>
                <td style={td}>{n(d.interested)}</td>
                <td style={td}>{n(d.notInterested)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ color: COLORS.textMuted }}>{TEXT.adStats.about}</p>
    </main>
  );
}
