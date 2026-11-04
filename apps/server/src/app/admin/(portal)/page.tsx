import { adminSummary } from '@/server/admin/summary';
import { requireAdminPage } from '../require-admin-page';
import { StatGrid, StatTile } from './admin-table';

export const dynamic = 'force-dynamic';

const TILES = [
  { key: 'openReports', label: 'Open reports', href: '/admin/reports' },
  { key: 'held', label: 'Held for review', href: '/admin/reports' },
  { key: 'openAppeals', label: 'Open appeals', href: '/admin/appeals' },
  { key: 'pendingSubmissions', label: 'Place suggestions', href: '/admin/submissions' },
  { key: 'openMessages', label: 'Messages', href: '/admin/messages' },
  { key: 'loginBursts', label: 'Blocked sign-in bursts (24 h)', href: '/admin/security' },
] as const;

/** P5.11: what's waiting, with links to each queue. */
export default async function Dashboard() {
  await requireAdminPage();
  const counts = await adminSummary();
  return (
    <>
      <h1>Dashboard</h1>
      <StatGrid>
        {TILES.map((t) => (
          <StatTile
            key={t.key}
            href={t.href}
            label={t.label}
            value={counts[t.key]}
            alert={counts[t.key] > 0}
          />
        ))}
      </StatGrid>
    </>
  );
}
