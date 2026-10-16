import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { adminPortalEnabled, isLocalRequest } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

/** D62: with the portal switched off (production default), every /admin page is a 404. */
export default async function AdminRoot({ children }: { children: ReactNode }) {
  if (!adminPortalEnabled() || !isLocalRequest(await headers())) notFound(); // D62, D68
  return children;
}
