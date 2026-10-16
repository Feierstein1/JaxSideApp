import { NextResponse } from 'next/server';
import { reportCreateSchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { createReport } from '@/server/reports';
import { parseBody } from '@/server/validate';

/**
 * P5.1: report a post, comment or profile. Users and guests (D28), each with their own
 * per-minute and per-day limits. Needs an in-Duval reading like viewing does (D16).
 */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const input = await parseBody(req, reportCreateSchema);
  const guest = actor.kind === 'guest';
  const subject = guest ? `guest:${actor.guest.id}` : `user:${actor.user.id}`;
  await enforce([
    {
      key: `report-min:${subject}`,
      limitKey: guest ? 'rateLimit.guestReport.perMinute' : 'rateLimit.report.perMinute',
      windowSeconds: 60,
    },
    {
      key: `report-day:${subject}`,
      limitKey: guest ? 'rateLimit.guestReport.perDay' : 'rateLimit.report.perDay',
      windowSeconds: 86_400,
    },
  ]);
  await assertLocationEligible(
    guest ? { kind: 'guest', guest: actor.guest } : { kind: 'user', user: actor.user },
    input.reading,
    'general.read',
  );
  await createReport(actor, input);
  // Same answer for a new report and a repeat, so nothing leaks about other reports.
  return NextResponse.json({ status: 'received' }, { status: 202 });
});
