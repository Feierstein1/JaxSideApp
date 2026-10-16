import type { ReactNode } from 'react';
import { NavLink, SignOutButton, TopBar, ui } from '../admin-ui';
import { requireAdminPage } from '../require-admin-page';

export const dynamic = 'force-dynamic';

/** Every page under /admin (except sign-in) needs a valid admin session (P5.11). */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <div style={ui.page}>
      <TopBar username={admin.username}>
        <NavLink href="/admin">Dashboard</NavLink>
        <NavLink href="/admin/reports">Reports</NavLink>
        <NavLink href="/admin/appeals">Appeals</NavLink>
        <NavLink href="/admin/submissions">Places</NavLink>
        <NavLink href="/admin/users">Users</NavLink>
        <NavLink href="/admin/audit">Audit log</NavLink>
        <SignOutButton />
      </TopBar>
      <main style={ui.main}>{children}</main>
    </div>
  );
}
