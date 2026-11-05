import {
  adDenialMessage,
  describeSchedule,
  planLimitProblem,
  takesPlanSlot,
  type AdminAdDecision,
} from '@jax/shared';
import type { Prisma } from '@/generated/prisma/client';
import { resetAdCache } from '../ads/serve';
import { db } from '../db';
import { ApiError } from '../http';
import { issueBusinessStrike } from '../moderation/business-enforcement';
import { audit } from './audit';
import { pageWindow, toPage } from './paging';
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

/** Ads waiting for approval, oldest first, 20 a page (D210). */
export async function listPendingAds(page = 1) {
  const where = { status: 'PENDING_REVIEW' } as const;
  const [ads, total] = await Promise.all([
    db.ad.findMany({
      where,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      ...pageWindow(page),
      include: forReview,
    }),
    db.ad.count({ where }),
  ]);
  const rows = ads.map((a) => ({
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
    /** D213: sent back with the decision, so a newer change isn't approved unseen. */
    updatedAt: a.updatedAt.toISOString(),
  }));
  return toPage(rows, total, page);
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
  // The tier's live ads, read before the lock (a plan change isn't what races here).
  const liveLimit = approve
    ? (await entitlementsFor(ad.accountId, now)).entitlements['ads.live']
    : 0;
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
  // D211: the business reads the chosen reason in plain words (plus any note).
  const reason = approve ? null : adDenialMessage(input.reasonCode!, input.note);
  await db.$transaction(async (tx) => {
    // D213: one change to a business's ad slots at a time. The website takes the same lock
    // when an Owner resumes or re-dates an ad, so two approvals (or an approval and a resume)
    // can't both count the slots before either is saved.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ad-slots:' + ad.accountId}))`;
    const current = await tx.ad.findUnique({
      where: { id: adId },
      select: { status: true, updatedAt: true },
    });
    if (current?.status !== 'PENDING_REVIEW') {
      throw new ApiError(409, 'STATE', 'This ad isn’t waiting for review.');
    }
    // D212 / D213: the Owner may edit a waiting ad; never decide on words the reviewer didn't see.
    if (current.updatedAt.toISOString() !== new Date(input.seenUpdatedAt).toISOString()) {
      throw new ApiError(
        409,
        'AD_CHANGED',
        'This ad changed since you opened it. Reload to see it.',
      );
    }
    if (approve) {
      // The plan may have changed since it was sent: approving must still fit (D167, D204).
      const inUse = (
        await tx.ad.findMany({
          where: { accountId: ad.accountId, status: 'APPROVED' },
          select: { status: true, startsAt: true, endsAt: true },
        })
      ).filter((a) => takesPlanSlot(a, now)).length;
      const problem = planLimitProblem(inUse, liveLimit);
      if (problem) throw new ApiError(409, 'PLAN_FULL', `Can’t approve: ${problem}`);
    }
    await tx.ad.update({
      where: { id: adId },
      data: approve ? { status: 'APPROVED', approvedAt: now } : { status: 'DRAFT' },
    });
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
      {
        business: ad.accountId,
        ...(reason ? { reason, reasonCode: input.reasonCode } : {}),
      },
      tx,
    );
  });
  resetAdCache();
  // D213: for businesses that keep sending AI food: a strike on the business (D191), with
  // the same words the business reads on its ad. Its own transaction and bell notice.
  if (input.strike && reason) {
    await issueBusinessStrike({ adminId, accountId: ad.accountId, reason, now });
  }
}
