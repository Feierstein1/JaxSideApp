import type { ReactNode } from 'react';
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
      { href: '/admin/security', label: 'Security' },
      { href: '/admin/audit', label: 'Audit log' },
    ],
  },
];

/** Every page under /admin (except sign-in) needs a valid admin session (P5.11). */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <div style={{ ...ui.page, display: 'flex' }}>
      <Sidebar username={admin.username} groups={NAV} />
      <main style={{ ...ui.main, flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
