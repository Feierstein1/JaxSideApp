import { COLORS } from '@jax/shared';
import { adminSummary } from '@/server/admin/summary';
import { requireAdminPage } from '../require-admin-page';

export const dynamic = 'force-dynamic';

const TILES = [
  { key: 'openReports', label: 'Open reports', href: '/admin/reports' },
  { key: 'held', label: 'Held for review', href: '/admin/reports' },
  { key: 'openAppeals', label: 'Open appeals', href: '/admin/appeals' },
  { key: 'pendingSubmissions', label: 'Place suggestions', href: '/admin/submissions' },
  { key: 'openMessages', label: 'Messages', href: '/admin/messages' },
] as const;

/** P5.11: what's waiting, with links to each queue. */
export default async function Dashboard() {
  await requireAdminPage();
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
          <a
            key={t.key}
            href={t.href}
            style={{
              background: COLORS.background,
              border: `1px solid ${COLORS.cardBorder}`,
              borderLeft: `6px solid ${COLORS.primary}`,
              borderRadius: 10,
              padding: 18,
              color: COLORS.text,
              textDecoration: 'none',
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 700 }}>{counts[t.key]}</div>
            <div style={{ color: COLORS.textMuted }}>{t.label}</div>
          </a>
        ))}
      </div>
    </>
  );
}
