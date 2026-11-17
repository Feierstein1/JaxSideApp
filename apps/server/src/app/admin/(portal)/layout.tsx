import type { ReactNode } from 'react';
import { COLORS } from '@jax/shared';
import { getMaintenance } from '@/server/maintenance';
import { Sidebar } from '../admin-nav';
import { ui, type NavGroup } from '../admin-ui';
import { requireAdminPage } from '../require-admin-page';

export const dynamic = 'force-dynamic';

const NAV: NavGroup[] = [
  {
    title: 'Overview',
    links: [
      { href: '/admin', label: 'Dashboard' },
      // D242: everything waiting for JaxSide, oldest first.
      { href: '/admin/review', label: 'Review queue' },
    ],
  },
  {
    title: 'Moderation',
    links: [
      { href: '/admin/reports', label: 'Reports' },
      { href: '/admin/appeals', label: 'Appeals' },
      { href: '/admin/users', label: 'Users' },
      { href: '/admin/removals', label: 'Removals' },
      { href: '/admin/screening', label: 'Screening' },
    ],
  },
  {
    title: 'Places & business',
    links: [
      { href: '/admin/submissions', label: 'Place suggestions' },
      { href: '/admin/places', label: 'All places' },
      { href: '/admin/ratings', label: 'Ratings' },
      { href: '/admin/owners', label: 'Owners' },
      { href: '/admin/businesses', label: 'Businesses' },
      { href: '/admin/ads', label: 'Ads' },
      { href: '/admin/organizers', label: 'Event organizers' },
      { href: '/admin/changes', label: 'Change requests' },
      { href: '/admin/promo-codes', label: 'Promo codes' },
    ],
  },
  {
    title: 'Community',
    links: [
      { href: '/admin/messages', label: 'Messages' },
      { href: '/admin/chat', label: 'Area chat' },
      { href: '/admin/polls', label: 'Polls' },
      { href: '/admin/giveaways', label: 'Giveaways' },
      { href: '/admin/topics', label: 'Topics' },
      { href: '/admin/events', label: 'Events' },
      { href: '/admin/stats', label: 'Area stats' },
    ],
  },
  {
    title: 'System',
    links: [
      { href: '/admin/maintenance', label: 'Maintenance' },
      { href: '/admin/security', label: 'Security' },
      { href: '/admin/audit', label: 'Audit log' },
    ],
  },
];

/** Every page under /admin (except sign-in) needs a valid admin session (P5.11). */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage();
  // The safe read: if the switch can't be read (say, its table isn't there yet) the portal still opens.
  const maintenance = await getMaintenance();
  return (
    <div style={{ ...ui.page, display: 'flex' }}>
      <Sidebar username={admin.username} groups={NAV} />
      <main style={{ ...ui.main, flex: 1, minWidth: 0 }}>
        {/* D246: impossible to miss while the app is switched off. */}
        {maintenance.on ? (
          <a
            href="/admin/maintenance"
            style={{
              display: 'block',
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 8,
              background: COLORS.error,
              color: COLORS.onPrimary,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Maintenance is ON: the app is switched off. Click here to switch it off.
          </a>
        ) : null}
        {children}
      </main>
    </div>
  );
}
