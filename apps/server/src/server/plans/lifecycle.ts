import {
  addMonths,
  APP_TIME_ZONE,
  localDate,
  localToUtc,
  nearestNeighborhood,
  NO_PLAN_ENTITLEMENTS,
  planEntitlements,
  TRIAL_DAYS,
  TRIAL_NOTICE_DAYS,
  type BoostStartInput,
} from '@jax/shared';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { ApiError } from '../http';
import { sendSafely } from '../mail/mailer';
import { planEndingEmail } from '../mail/templates';

/*
 * D248: a business's plan over time. Every new account gets Standard free for 30 days once
 * (the trial: one per account and per place), then Free forever. A promo code gives a plan for
 * some days. When a trial, promo or comp ends, the account moves to Free (a subscription with
 * no end). Three days before, the business gets a notice and an email; on the switch, a
 * "You're now on Free" notice the website shows once. Boosts come from the plan's monthly
 * allowance. The owner website writes the same rows for organizers and codes (shared rules).
 */

const DAY_MS = 86_400_000;
export const CURRENT = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const;

const currentWhere = (now: Date) => ({
  status: { in: [...CURRENT] },
  startsAt: { lte: now },
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

/**
 * The account's trial: Standard for `TRIAL_DAYS`, if neither the account nor the place has had
 * one and it has no current plan (never fails; an organizer has no place).
 */
export async function startTrial(
  tx: Prisma.TransactionClient,
  accountId: string,
  placeId: string | null,
  now: Date,
) {
  const standard = await tx.plan.findFirst({
    where: { code: 'STANDARD', active: true },
    select: { id: true },
  });
  if (!standard) return;
  const endsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  // ON CONFLICT: the account or place already had its trial, or the account has a plan.
  await tx.$executeRaw`
    INSERT INTO "Subscription"
      (id, "accountId", "planId", status, source, "startsAt", "endsAt", "freeTierPlaceId",
       "currentPeriodStart", "currentPeriodEnd", "createdAt")
    VALUES (gen_random_uuid(), ${accountId}::uuid, ${standard.id}::uuid, 'TRIALING', 'FREE_TIER',
       ${now}, ${endsAt}, ${placeId}::uuid, ${now}, ${endsAt}, ${now})
    ON CONFLICT DO NOTHING`;
}

/** A line about Free for notices and emails ("5 new events a month, 1 live ad, …"). */
async function freeSummary() {
  const free = await db.plan.findFirst({
    where: { code: 'FREE' },
    include: { entitlements: true },
  });
  const e = { ...NO_PLAN_ENTITLEMENTS, ...planEntitlements(free?.entitlements ?? []) };
  const events =
    e['events.limit'] === null ? 'unlimited events' : `${e['events.limit']} new events a month`;
  const ads = `${e['ads.live']} live ad${e['ads.live'] === 1 ? '' : 's'}`;
  return `${events}, ${ads}, shown to people within about a mile`;
}

const dateText = (d: Date) =>
  d.toLocaleDateString('en-US', { timeZone: APP_TIME_ZONE, month: 'long', day: 'numeric' });

/**
 * Daily (maintenance): plans that ended are marked expired and the account moves to Free;
 * plans ending within `TRIAL_NOTICE_DAYS` (trials, promos, comps) get their notice and email
 * once. Returns counts for the report.
 */
export async function rollPlans(now = new Date()) {
  const free = await db.plan.findFirst({
    where: { code: 'FREE' },
    select: { id: true, rank: true },
  });
  // 1. Ending soon: tell them once (paid plans renew, so only free ones).
  const soon = await db.subscription.findMany({
    where: {
      status: { in: [...CURRENT] },
      source: { in: ['FREE_TIER', 'PROMO', 'COMP'] },
      endingNoticeAt: null,
      endsAt: { gt: now, lte: new Date(now.getTime() + TRIAL_NOTICE_DAYS * DAY_MS) },
      plan: { code: { not: 'FREE' } },
    },
    include: { plan: { select: { name: true } }, account: { select: { email: true } } },
  });
  const summary = soon.length ? await freeSummary() : '';
  for (const s of soon) {
    const claimed = await db.subscription.updateMany({
      where: { id: s.id, endingNoticeAt: null },
      data: { endingNoticeAt: now },
    });
    if (!claimed.count) continue;
    const what =
      s.source === 'FREE_TIER' ? `Your ${s.plan.name} trial` : `Your ${s.plan.name} plan`;
    const title = `${what} ends on ${dateText(s.endsAt!)}`;
    const body = `You'll move to Free: ${summary}. Your approved events stay listed.`;
    await db.businessNotice.create({
      data: {
        accountId: s.accountId,
        kind: 'TRIAL_ENDING',
        title,
        body,
        link: '/account/plan',
        createdAt: now,
      },
    });
    if (s.account.email) {
      await sendSafely(planEndingEmail(s.account.email, title, body), 'plan-ending');
    }
  }

  // 2. Ended: expired, then Free (no end) for owner accounts left without a plan.
  const ended = await db.subscription.findMany({
    where: { status: { in: [...CURRENT] }, endsAt: { lte: now } },
    include: { plan: { select: { rank: true, name: true } } },
  });
  let movedToFree = 0;
  for (const s of ended) {
    const done = await db.subscription.updateMany({
      where: { id: s.id, status: { in: [...CURRENT] } },
      data: { status: 'EXPIRED' },
    });
    if (!done.count || !free) continue;
    const moved = await db.$transaction(async (tx) => {
      if (
        await tx.subscription.count({ where: { accountId: s.accountId, ...currentWhere(now) } })
      ) {
        return false;
      }
      await tx.subscription.create({
        data: { accountId: s.accountId, planId: free.id, source: 'FREE_PLAN', startsAt: now },
      });
      if (s.plan.rank > free.rank) {
        await tx.businessNotice.create({
          data: {
            accountId: s.accountId,
            kind: 'PLAN_DOWNGRADED',
            title: 'You’re now on Free',
            body: `Your ${s.plan.name} ${s.source === 'FREE_TIER' ? 'trial' : 'plan'} ended. Free gives you ${await freeSummary()}. Upgrade any time on your Plan page.`,
            link: '/account/plan',
            createdAt: now,
          },
        });
      }
      return true;
    });
    if (moved) movedToFree++;
  }
  return { subscriptionsExpired: ended.length, movedToFree, planEndingNotices: soon.length };
}

/**
 * D248: an event ad whose event is over (no date to come) or off the calendar is ended, so the
 * website lists it as ended and it stops taking a live slot. Boosts past their days end too.
 */
export async function endFinishedEventAds(now = new Date()) {
  const ads = await db.$executeRaw`
    UPDATE "Ad" a SET status = 'ENDED', "updatedAt" = ${now}
    FROM "Event" e
    WHERE a."eventId" = e.id AND a.status IN ('APPROVED', 'PAUSED')
      AND (e.status NOT IN ('APPROVED') OR e."lastEndsAt" IS NULL OR e."lastEndsAt" <= ${now})`;
  // D247: website events go live without passing through us; give any without a
  // neighborhood one (the website should set it with the shared `nearestNeighborhood`).
  const unnamed = await db.event.findMany({
    where: {
      neighborhood: null,
      latitude: { not: null },
      status: { in: ['APPROVED', 'CANCELLED'] },
    },
    select: { id: true, latitude: true, longitude: true },
    take: 500,
  });
  for (const e of unnamed) {
    const name = nearestNeighborhood({ latitude: e.latitude!, longitude: e.longitude! });
    if (name) await db.event.update({ where: { id: e.id }, data: { neighborhood: name } });
  }
  const boosts = await db.boost.updateMany({
    where: { status: 'ACTIVE', endsAt: { lte: now } },
    data: { status: 'ENDED' },
  });
  return { eventAdsEnded: ads, boostsEnded: boosts.count, eventsNamed: unnamed.length };
}

// ───────────────────────────── Promo codes ─────────────────────────────

/**
 * D248: a business uses a promo code (the website calls the same rule). One code per account,
 * ever; the code's use count can't pass its cap (checked atomically). If the account is on the
 * same plan for free (trial or promo), the days are added to it; otherwise its current free plan
 * ends and the promo plan starts now. Never for an account on a paid plan, or an organizer.
 */
export async function redeemPromo(accountId: string, rawCode: string, now = new Date()) {
  const code = rawCode.trim().toUpperCase();
  return db.$transaction(async (tx) => {
    const account = await tx.businessAccount.findUnique({
      where: { id: accountId },
      select: { kind: true, createdById: true },
    });
    if (!account || account.createdById || account.kind === 'ORGANIZER') {
      throw new ApiError(403, 'BUSINESS_ONLY', 'Promo codes are for business accounts.');
    }
    if (await tx.promoRedemption.count({ where: { accountId } })) {
      throw new ApiError(409, 'ALREADY_USED_A_CODE', 'This account already used a promo code.');
    }
    // Claim a use atomically (the CHECK also stops uses passing maxUses).
    const [promo] = await tx.$queryRaw<{ id: string; planId: string; days: number }[]>`
      UPDATE "PromoCode" SET uses = uses + 1
      WHERE code = ${code} AND active AND uses < "maxUses"
        AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
      RETURNING id, "planId", days`;
    if (!promo) {
      throw new ApiError(404, 'CODE_NOT_VALID', 'That code isn’t valid, or it’s all used up.');
    }
    const current = await tx.subscription.findFirst({
      where: { accountId, ...currentWhere(now) },
    });
    if (current?.source === 'STRIPE') {
      throw new ApiError(409, 'ON_PAID_PLAN', 'Codes can’t be used while on a paid plan.');
    }
    let subscriptionId: string;
    if (current && current.planId === promo.planId && current.endsAt) {
      // Same plan (e.g. the Standard trial): add the days to it.
      const endsAt = new Date(current.endsAt.getTime() + promo.days * DAY_MS);
      await tx.subscription.update({
        where: { id: current.id },
        data: { endsAt, currentPeriodEnd: endsAt, endingNoticeAt: null },
      });
      subscriptionId = current.id;
    } else {
      if (current) {
        await tx.subscription.update({
          where: { id: current.id },
          data: { status: 'CANCELLED', cancelledAt: now, cancelReason: `Promo code ${code}` },
        });
      }
      const endsAt = new Date(now.getTime() + promo.days * DAY_MS);
      const sub = await tx.subscription.create({
        data: {
          accountId,
          planId: promo.planId,
          source: 'PROMO',
          startsAt: now,
          endsAt,
          currentPeriodStart: now,
          currentPeriodEnd: endsAt,
          note: `Promo code ${code}`,
        },
      });
      subscriptionId = sub.id;
    }
    await tx.promoRedemption.create({
      data: { codeId: promo.id, accountId, subscriptionId, redeemedAt: now },
    });
    return tx.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: { plan: { select: { code: true, name: true } } },
    });
  });
}

// ───────────────────────────── Boosts ─────────────────────────────

/** The Jacksonville calendar month a moment falls in, as its first and next-first instants. */
export function monthBounds(now: Date) {
  const month = localDate(now).slice(0, 7);
  return {
    from: localToUtc(`${month}-01`, '00:00'),
    to: localToUtc(`${addMonths(month, 1)}-01`, '00:00'),
  };
}

/**
 * D248: a business boosts one of its approved ads or events (the website calls the same rule).
 * Uses the plan's `boosts.perMonth` (counted by start, Jacksonville month); one live boost per
 * ad or event. Serialised per account with the same lock as ad slots.
 */
export async function startBoost(accountId: string, input: BoostStartInput, now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ad-slots:' || ${accountId}))`;
    const sub = await tx.subscription.findFirst({
      where: { accountId, ...currentWhere(now) },
      include: { plan: { include: { entitlements: true } } },
    });
    const allowance = {
      ...NO_PLAN_ENTITLEMENTS,
      ...planEntitlements(sub?.plan.entitlements ?? []),
    }['boosts.perMonth'];
    const { from, to } = monthBounds(now);
    const used = await tx.boost.count({
      where: { accountId, source: 'PLAN', startsAt: { gte: from, lt: to } },
    });
    if (used >= allowance) {
      throw new ApiError(
        409,
        'NO_BOOSTS_LEFT',
        allowance === 0
          ? 'Your plan doesn’t include boosts.'
          : `Your plan includes ${allowance} boost${allowance === 1 ? '' : 's'} a month; you’ve used ${used === 1 && allowance === 1 ? 'it' : 'them'}.`,
      );
    }
    const target = input.adId
      ? await tx.ad.count({ where: { id: input.adId, accountId, status: 'APPROVED' } })
      : await tx.event.count({
          where: { id: input.eventId, businessAccountId: accountId, status: 'APPROVED' },
        });
    if (!target) {
      throw new ApiError(404, 'NOT_FOUND', 'Boost one of your approved ads or events.');
    }
    const live = await tx.boost.count({
      where: {
        status: 'ACTIVE',
        endsAt: { gt: now },
        ...(input.adId ? { adId: input.adId } : { eventId: input.eventId }),
      },
    });
    if (live) throw new ApiError(409, 'ALREADY_BOOSTED', 'This is already boosted.');
    const days = Number(input.days);
    return tx.boost.create({
      data: {
        accountId,
        adId: input.adId ?? null,
        eventId: input.eventId ?? null,
        days,
        startsAt: now,
        endsAt: new Date(now.getTime() + days * DAY_MS),
        source: 'PLAN',
      },
    });
  });
}
