import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { adminPortalEnabled } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

/** D62: with the portal switched off (production default), every /admin page is a 404. */
export default function AdminRoot({ children }: { children: ReactNode }) {
  if (!adminPortalEnabled()) notFound();
  return children;
}
