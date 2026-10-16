import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ADMIN_COOKIE, adminFromToken, adminPortalEnabled } from '@/server/admin/auth';
import { ApiError } from '@/server/http';

/**
 * Every admin page calls this itself (not only the layout), because Next can render a
 * page without re-running its layout on client navigation (P5.11).
 */
export async function requireAdminPage() {
  if (!adminPortalEnabled()) notFound(); // D62
  const token = (await cookies()).get(ADMIN_COOKIE)?.value ?? null;
  try {
    return (await adminFromToken(token, { mutation: false })).admin;
  } catch (err) {
    if (err instanceof ApiError) redirect('/admin/login');
    throw err;
  }
}
