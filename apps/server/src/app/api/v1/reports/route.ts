import { NextResponse } from 'next/server';
import { reportCreateSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { createReport } from '@/server/reports';
import { parseBody } from '@/server/validate';

/**
 * P5.1: report a post, comment or profile. Registered users only (guests are view-only,
 * D54). Needs an in-Duval reading like viewing does (D16).
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const input = await parseBody(req, reportCreateSchema);
  await enforce([
    {
      key: `report-min:user:${user.id}`,
      limitKey: 'rateLimit.report.perMinute',
      windowSeconds: 60,
    },
    {
      key: `report-day:user:${user.id}`,
      limitKey: 'rateLimit.report.perDay',
      windowSeconds: 86_400,
    },
  ]);
  await assertLocationEligible({ kind: 'user', user }, input.reading, 'general.read');
  await createReport({ kind: 'user', user }, input);
  // Same answer for a new report and a repeat, so nothing leaks about other reports.
  return NextResponse.json({ status: 'received' }, { status: 202 });
});
