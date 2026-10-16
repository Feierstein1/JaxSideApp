import { COLORS } from '@jax/shared';
import { adminSummary } from '@/server/admin/summary';

export const dynamic = 'force-dynamic';

const TILES = [
  { key: 'openReports', label: 'Open reports' },
  { key: 'held', label: 'Held for review' },
  { key: 'openAppeals', label: 'Open appeals' },
  { key: 'pendingSubmissions', label: 'Place submissions' },
] as const;

/** P5.11: what's waiting. The queues themselves come next (P5.12, P5.14). */
export default async function Dashboard() {
  const counts = await adminSummary();
  return (
    <>
      <h1>Dashboard</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {TILES.map((t) => (
          <div
            key={t.key}
            style={{
              background: COLORS.background,
              border: `1px solid ${COLORS.cardBorder}`,
              borderLeft: `6px solid ${COLORS.primary}`,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 700 }}>{counts[t.key]}</div>
            <div style={{ color: COLORS.textMuted }}>{t.label}</div>
          </div>
        ))}
      </div>
    </>
  );
}
