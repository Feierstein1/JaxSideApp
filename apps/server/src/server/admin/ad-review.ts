import {
  describeSchedule,
  planLimitProblem,
  takesPlanSlot,
  type AdminAdDecision,
} from '@jax/shared';
import type { Prisma } from '@/generated/prisma/client';
import { resetAdCache } from '../ads/serve';
import { db } from '../db';
import { ApiError } from '../http';
import { audit } from './audit';
import { entitlementsFor } from './plans';

/**
 * B3.3 / D206: JaxSide approves every ad before it can show (D166). The business sends it
 * from the website (PENDING_REVIEW); an admin approves it (APPROVED: it goes live on its
 * schedule) or turns it down with a reason (back to DRAFT; the website shows the reason).
 * Each decision keeps a snapshot of what the ad said, and the business is told in its bell.
 */

const forReview = {
  place: { select: { id: true, name: true, address: true } },
  account: { select: { id: true, email: true } },
  createdBy: { select: { email: true, username: true } },
  media: { select: { id: true, mimeType: true } },
} satisfies Prisma.AdInclude;

export async function listPendingAds() {
  const ads = await db.ad.findMany({
    where: { status: 'PENDING_REVIEW' },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    take: 100,
    include: forReview,
  });
  return ads.map((a) => ({
    id: a.id,
    template: a.template,
    headline: a.headline,
    body: a.body,
    adultsOnly: a.adultsOnly,
    // Through the admin route (it serves any business image, for review).
    imageUrl: a.media ? `/api/v1/admin/business-pictures/${a.media.id}` : null,
    place: a.place,
    business: { id: a.account.id, email: a.account.email ?? '' },
    madeBy: a.createdBy?.username ?? a.createdBy?.email ?? null,
    schedule: describeSchedule(a),
    startsAt: a.startsAt?.toISOString() ?? null,
    endsAt: a.endsAt?.toISOString() ?? null,
    reach: a.cityWide
      ? 'City-wide'
      : [
          a.zips.length ? `ZIP ${a.zips.join(', ')}` : null,
          a.radiusMeters ? `${a.radiusMeters} m around the place` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'No targeting',
    submittedAt: a.submittedAt?.toISOString() ?? null,
  }));
}

export async function decideAd(
  adminId: string,
  adId: string,
  input: AdminAdDecision,
  now = new Date(),
) {
  const ad = await db.ad.findUnique({ where: { id: adId }, include: forReview });
  if (!ad) throw new ApiError(404, 'NOT_FOUND', 'Ad not found');
  if (ad.status !== 'PENDING_REVIEW') {
    throw new ApiError(
      409,
      'STATE',
      'This ad isn’t waiting for review (it was taken back or decided).',
    );
  }
  const approve = input.decision === 'approve';
  if (approve) {
    // The plan may have changed since it was sent: approving must still fit (D167, D204).
    const { entitlements } = await entitlementsFor(ad.accountId, now);
    const inUse = (
      await db.ad.findMany({
        where: { accountId: ad.accountId, status: 'APPROVED' },
        select: { status: true, startsAt: true, endsAt: true },
      })
    ).filter((a) => takesPlanSlot(a, now)).length;
    const problem = planLimitProblem(inUse, entitlements['ads.live']);
    if (problem) throw new ApiError(409, 'PLAN_FULL', `Can’t approve: ${problem}`);
  }
  const snapshot = {
    template: ad.template,
    headline: ad.headline,
    body: ad.body,
    mediaId: ad.mediaId,
    adultsOnly: ad.adultsOnly,
    startsAt: ad.startsAt?.toISOString() ?? null,
    endsAt: ad.endsAt?.toISOString() ?? null,
    daysOfWeek: ad.daysOfWeek,
    dailyStartMin: ad.dailyStartMin,
    dailyEndMin: ad.dailyEndMin,
    zips: ad.zips,
    radiusMeters: ad.radiusMeters,
    cityWide: ad.cityWide,
  };
  const reason = approve ? null : input.reason!;
  await db.$transaction(async (tx) => {
    // Only if it's still waiting (the owner may take it back at the same moment).
    const moved = await tx.ad.updateMany({
      where: { id: adId, status: 'PENDING_REVIEW' },
      data: approve ? { status: 'APPROVED', approvedAt: now } : { status: 'DRAFT' },
    });
    if (moved.count === 0) throw new ApiError(409, 'STATE', 'This ad isn’t waiting for review.');
    await tx.adReview.create({
      data: {
        adId,
        adminId,
        decision: approve ? 'APPROVED' : 'REJECTED',
        reason,
        snapshot,
        createdAt: now,
      },
    });
    await tx.businessNotice.create({
      data: {
        accountId: ad.accountId,
        placeId: ad.placeId,
        kind: approve ? 'AD_APPROVED' : 'AD_REJECTED',
        title: (approve
          ? `Your ad “${ad.headline}” was approved`
          : `Your ad “${ad.headline}” needs changes`
        ).slice(0, 120),
        body: approve ? 'It shows in the app on its schedule.' : reason,
        link: `/places/${ad.placeId}/ads/${adId}`,
        createdAt: now,
      },
    });
    await audit(
      adminId,
      approve ? 'AD_APPROVE' : 'AD_REJECT',
      { type: 'ad', id: adId },
      { business: ad.accountId, ...(reason ? { reason } : {}) },
      tx,
    );
  });
  resetAdCache();
}
