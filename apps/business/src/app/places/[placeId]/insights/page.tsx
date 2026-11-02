import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { COLORS } from '@jax/shared';
import { ApiError } from '@/server/http';
import { placeInsights } from '@/server/insights';
import { TEXT } from '@/text';
import { requireAccount } from '../../../require-account';

const n = (v: number | null) => (v === null ? TEXT.insights.fewer : v.toLocaleString('en-US'));

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        padding: 14,
        background: COLORS.background,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12,
      }}
    >
      <div style={{ color: COLORS.textMuted, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
} as const;

/** B2.1: counts for the place's Owner. Never anyone's identity; groups under 10 hidden. */
export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ placeId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const account = await requireAccount();
  const { placeId } = await params;
  const period = (await searchParams).period === '30d' ? '30d' : '7d';
  let data;
  try {
    data = await placeInsights(account, placeId, period);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403 && err.code !== 'ROLE') {
      return (
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
          <Link href={`/places/${placeId}`}>← {TEXT.common.back}</Link>
          <h1>{TEXT.insights.title}</h1>
          <p>{err.message}</p>
        </main>
      );
    }
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const { place, area, activity } = data;
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '48px 16px' }}>
      <Link href={`/places/${place.id}`}>← {place.name}</Link>
      <h1>{TEXT.insights.title}</h1>
      <p>
        {(['7d', '30d'] as const).map((k) => (
          <Link
            key={k}
            href={`/places/${place.id}/insights?period=${k}`}
            style={{ marginRight: 14, fontWeight: k === period ? 800 : 400 }}
          >
            {TEXT.insights.periods[k]}
          </Link>
        ))}
        <span style={{ color: COLORS.textMuted }}>
          {TEXT.insights.range(data.period.from, data.period.to)}
        </span>
      </p>

      <h2>{TEXT.insights.areaTitle(area?.zip ?? null)}</h2>
      {area ? (
        <>
          <div style={grid}>
            <Stat label={TEXT.insights.perDay} value={n(area.perDay)} />
            <Stat label={TEXT.insights.weekdayAvg} value={n(area.weekdayAvg)} />
            <Stat label={TEXT.insights.weekendAvg} value={n(area.weekendAvg)} />
            <Stat label={TEXT.insights.newThisMonth} value={n(area.newThisMonth)} />
            {area.lastWeek ? (
              <Stat label={TEXT.insights.lastWeek} value={n(area.lastWeek.people)} />
            ) : null}
            {area.lastMonth ? (
              <Stat label={TEXT.insights.lastMonth} value={n(area.lastMonth.people)} />
            ) : null}
          </div>
          <h3>{TEXT.insights.partOfDay}</h3>
          <div style={grid}>
            <Stat label={TEXT.insights.morning} value={n(area.partOfDay.morning)} />
            <Stat label={TEXT.insights.afternoon} value={n(area.partOfDay.afternoon)} />
            <Stat label={TEXT.insights.evening} value={n(area.partOfDay.evening)} />
            <Stat label={TEXT.insights.night} value={n(area.partOfDay.night)} />
          </div>
          <h3>{TEXT.insights.alsoVisited}</h3>
          {area.alsoVisited.length ? (
            <ul>
              {area.alsoVisited.map((f) => (
                <li key={f.zip}>
                  {f.zip}: {f.peopleDays.toLocaleString('en-US')} {TEXT.insights.peopleDays}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: COLORS.textMuted }}>{TEXT.insights.notEnough}</p>
          )}
        </>
      ) : (
        <p style={{ color: COLORS.textMuted }}>{TEXT.insights.noZip}</p>
      )}

      <h2>{TEXT.insights.activityTitle}</h2>
      <div style={grid}>
        <Stat label={TEXT.insights.posts} value={n(activity.posts)} />
        <Stat label={TEXT.insights.comments} value={n(activity.comments)} />
        <Stat label={TEXT.insights.people} value={n(activity.peopleDays)} />
        <Stat label={TEXT.insights.favorites} value={n(activity.favorites)} />
        <Stat label={TEXT.insights.votes} value={n(activity.votes)} />
      </div>

      <h2>{TEXT.insights.aboutTitle}</h2>
      <ul style={{ color: COLORS.textMuted }}>
        {TEXT.insights.about.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
