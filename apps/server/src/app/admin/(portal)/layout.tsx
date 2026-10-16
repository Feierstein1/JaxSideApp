import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, adminFromToken } from '@/server/admin/auth';
import { ApiError } from '@/server/http';
import { NavLink, SignOutButton, TopBar, ui } from '../admin-ui';

export const dynamic = 'force-dynamic';

/** Every page under /admin (except sign-in) needs a valid admin session (P5.11). */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value ?? null;
  let username: string;
  try {
    username = (await adminFromToken(token, { mutation: false })).admin.username;
  } catch (err) {
    if (err instanceof ApiError) redirect('/admin/login');
    throw err;
  }
  return (
    <div style={ui.page}>
      <TopBar username={username}>
        <NavLink href="/admin">Dashboard</NavLink>
        <SignOutButton />
      </TopBar>
      <main style={ui.main}>{children}</main>
    </div>
  );
}
