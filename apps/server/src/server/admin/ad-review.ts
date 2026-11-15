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
 * B3.3 / D206, D247: ads go live as soon as the Owner says so (no approval first). JaxSide
 * looks at live ads afterwards ("Live, not looked at yet": OK, or take it down with a reason:
 * back to DRAFT, the website shows the reason). An ad sent again after a take-down waits for
 * JaxSide (PENDING_REVIEW: approve or turn down, as before). Each decision keeps a snapshot of
 * what the ad said; the business is told in its bell (not for "OK").
 */

/** D230: what an ad promotes, for the admin pages: its place, or its event when it has none. */
export function adSubject(a: {
  place: { id: string; name: string; address?: string | null } | null;
  event: { id: string; title: string } | null;
}) {
  if (a.place) return { id: a.place.id, name: a.place.name, address: a.place.address ?? null };
  if (a.event) return { id: a.event.id, name: `Event: ${a.event.title}`, address: null };
  return { id: '', name: '(nothing)', address: null };
}

const forReview = {
  place: { select: { id: true, name: true, address: true } },
  event: { select: { id: true, title: true } },
  account: { select: { id: true, email: true } },
  createdBy: { select: { email: true, username: true } },
  media: { select: { id: true, mimeType: true } },
} satisfies Prisma.AdInclude;

/** Ads waiting for approval, oldest first, 20 a page (D210). */
/** The address's host ("www.boldbean.com"), or the raw text if it doesn't parse. */
function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * D247: live (or paused) ads JaxSide hasn't looked at since they last changed: no review
 * made at or after the ad's last update. Newest first.
 */
export async function listUncheckedAds(page = 1) {
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT a.id FROM "Ad" a
    WHERE a.status IN ('APPROVED', 'PAUSED')
      AND NOT EXISTS (SELECT 1 FROM "AdReview" r WHERE r."adId" = a.id AND r."createdAt" >= a."updatedAt")
    ORDER BY a."approvedAt" DESC NULLS LAST, a.id`;
  const pageIds = ids.slice((page - 1) * 20, page * 20).map((r) => r.id);
  const ads = await db.ad.findMany({ where: { id: { in: pageIds } }, include: forReview });
  const order = new Map(pageIds.map((id, i) => [id, i]));
  ads.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return toPage(ads.map(toRow), ids.length, page);
}

export async function countUncheckedAds() {
  const [r] = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "Ad" a
    WHERE a.status IN ('APPROVED', 'PAUSED')
      AND NOT EXISTS (SELECT 1 FROM "AdReview" r WHERE r."adId" = a.id AND r."createdAt" >= a."updatedAt")`;
  return r?.n ?? 0;
}

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
  return toPage(ads.map(toRow), total, page);
}

function toRow(a: Prisma.AdGetPayload<{ include: typeof forReview }>) {
  return {
    id: a.id,
    template: a.template,
    headline: a.headline,
    body: a.body,
    adultsOnly: a.adultsOnly,
    // Through the admin route (it serves any business image, for review).
    imageUrl: a.media ? `/api/v1/admin/business-pictures/${a.media.id}` : null,
    place: adSubject(a),
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
    /** D216: the link in full and its host, so the reviewer sees exactly where it goes. */
    link:
      a.linkUrl && a.linkLabel
        ? { url: a.linkUrl, label: a.linkLabel, host: hostOf(a.linkUrl) }
        : null,
    /** D213: sent back with the decision, so a newer change isn't approved unseen. */
    updatedAt: a.updatedAt.toISOString(),
    status: a.status,
    approvedAt: a.approvedAt?.toISOString() ?? null,
  };
}

export async function decideAd(
  adminId: string,
  adId: string,
  input: AdminAdDecision,
  now = new Date(),
) {
  const ad = await db.ad.findUnique({ where: { id: adId }, include: forReview });
  if (!ad) throw new ApiError(404, 'NOT_FOUND', 'Ad not found');
  // D247: approve / reject are for ads waiting (sent again after a take-down); ok / takedown
  // for ads already live or paused.
  const onLive = input.decision === 'ok' || input.decision === 'takedown';
  const allowed = onLive ? ['APPROVED', 'PAUSED'] : ['PENDING_REVIEW'];
  if (!allowed.includes(ad.status)) {
    throw new ApiError(
      409,
      'STATE',
      onLive
        ? 'This ad isn’t live any more (it was paused, ended or changed).'
        : 'This ad isn’t waiting for review (it was taken back or decided).',
    );
  }
  const approve = input.decision === 'approve';
  const fine = approve || input.decision === 'ok';
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
    linkUrl: ad.linkUrl,
    linkLabel: ad.linkLabel,
  };
  // D211: the business reads the chosen reason in plain words (plus any note).
  const reason = fine ? null : adDenialMessage(input.reasonCode!, input.note);
  await db.$transaction(async (tx) => {
    // D213: one change to a business's ad slots at a time. The website takes the same lock
    // when an Owner resumes or re-dates an ad, so two approvals (or an approval and a resume)
    // can't both count the slots before either is saved.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ad-slots:' + ad.accountId}))`;
    const current = await tx.ad.findUnique({
      where: { id: adId },
      select: { status: true, updatedAt: true },
    });
    if (!current || !allowed.includes(current.status)) {
      throw new ApiError(409, 'STATE', 'This ad changed state. Reload to see it.');
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
    if (input.decision !== 'ok') {
      await tx.ad.update({
        where: { id: adId },
        data: approve
          ? { status: 'APPROVED', approvedAt: now }
          : input.decision === 'takedown'
            ? { status: 'DRAFT', approvedAt: null }
            : { status: 'DRAFT' },
      });
    }
    await tx.adReview.create({
      data: {
        adId,
        adminId,
        decision: fine ? 'APPROVED' : 'REJECTED',
        reason,
        snapshot,
        createdAt: now,
      },
    });
    // D247: "looked at, OK" tells nobody; the rest go to the business's bell.
    if (input.decision !== 'ok') {
      await tx.businessNotice.create({
        data: {
          accountId: ad.accountId,
          placeId: ad.placeId,
          kind: approve ? 'AD_APPROVED' : 'AD_REJECTED',
          title: (approve
            ? `Your ad “${ad.headline}” was approved`
            : input.decision === 'takedown'
              ? `JaxSide took your ad “${ad.headline}” down`
              : `Your ad “${ad.headline}” needs changes`
          ).slice(0, 120),
          body: approve ? 'It shows in the app on its schedule.' : reason,
          // D230: an organizer's ad has no place.
          link: ad.placeId ? `/places/${ad.placeId}/ads/${adId}` : `/ads/${adId}`,
          createdAt: now,
        },
      });
    }
    await audit(
      adminId,
      { approve: 'AD_APPROVE', reject: 'AD_REJECT', ok: 'AD_LOOKED_AT', takedown: 'AD_TAKEDOWN' }[
        input.decision
      ],
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
