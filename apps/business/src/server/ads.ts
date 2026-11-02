import {
  AD_LIBRARY_MAX,
  adDisplayState,
  adSubmitProblems,
  describeSchedule,
  planLimitProblem,
  takesPlanSlot,
  type AdDisplayState,
  type AdDraft,
} from '@jax/shared';
import type { Ad, BusinessAccount, Prisma } from '@/generated/prisma/client';
import { db } from './db';
import { ApiError } from './http';
import { can, myPlaces, requirePlace } from './places';
import { currentPlan } from './plan';
import { screenText } from './screening';

/**
 * B3.2 (D166, D167, D177): the ad library. A business keeps up to 20 ads (drafts and past
 * ads count). Owners and Managers draft; only the Owner sends an ad for approval, pauses,
 * resumes and ends it. A JaxSide admin approves every ad before it can run (B3.3), and
 * editing an approved ad sends it back for approval. Live and scheduled ads count against
 * the plan (Q35). Ads belong to the business (the owner account), each for one of its places.
 */

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Ad not found.');
const ownerOf = (a: Pick<BusinessAccount, 'id' | 'createdById'>) => a.createdById ?? a.id;

export type AdView = {
  id: string;
  placeId: string;
  placeName: string;
  template: Ad['template'];
  headline: string;
  body: string | null;
  mediaId: string | null;
  mediaUrl: string | null;
  adultsOnly: boolean;
  startsAt: string | null;
  endsAt: string | null;
  daysOfWeek: number;
  dailyStartMin: number | null;
  dailyEndMin: number | null;
  radiusMeters: number | null;
  zips: string[];
  status: Ad['status'];
  state: AdDisplayState;
  schedule: string;
  /** Why JaxSide turned it down last time (shown until it's sent again). */
  rejectedBecause: string | null;
  updatedAt: string;
};

type AdRow = Ad & {
  place: { name: string };
  reviews: { decision: string; reason: string | null }[];
};

function view(ad: AdRow, now: Date): AdView {
  const last = ad.reviews[0];
  return {
    id: ad.id,
    placeId: ad.placeId,
    placeName: ad.place.name,
    template: ad.template,
    headline: ad.headline,
    body: ad.body,
    mediaId: ad.mediaId,
    mediaUrl: ad.mediaId ? `/api/ads/media/${ad.mediaId}` : null,
    adultsOnly: ad.adultsOnly,
    startsAt: ad.startsAt?.toISOString() ?? null,
    endsAt: ad.endsAt?.toISOString() ?? null,
    daysOfWeek: ad.daysOfWeek,
    dailyStartMin: ad.dailyStartMin,
    dailyEndMin: ad.dailyEndMin,
    radiusMeters: ad.radiusMeters,
    zips: ad.zips,
    status: ad.status,
    state: adDisplayState(ad, now),
    schedule: describeSchedule(ad),
    rejectedBecause:
      ad.status === 'DRAFT' && last?.decision === 'REJECTED' ? (last.reason ?? '') : null,
    updatedAt: ad.updatedAt.toISOString(),
  };
}

const withPlace = {
  place: { select: { name: true } },
  reviews: { orderBy: { createdAt: 'desc' }, take: 1, select: { decision: true, reason: true } },
} satisfies Prisma.AdInclude;

/** Places where this login may work on ads. */
async function adPlaceIds(account: BusinessAccount) {
  return (await myPlaces(account.id)).filter((p) => can(p.role, 'ads')).map((p) => p.id);
}

/** The business's ads this login may see, newest first, with the library and plan numbers. */
export async function listAds(account: BusinessAccount, now = new Date()) {
  const placeIds = await adPlaceIds(account);
  const ownerId = ownerOf(account);
  const [ads, total, slotRows, plan] = await Promise.all([
    db.ad.findMany({
      where: { accountId: ownerId, placeId: { in: placeIds } },
      orderBy: { updatedAt: 'desc' },
      include: withPlace,
    }),
    db.ad.count({ where: { accountId: ownerId } }),
    db.ad.findMany({
      where: { accountId: ownerId, status: 'APPROVED' },
      select: { status: true, startsAt: true, endsAt: true },
    }),
    currentPlan(account, now),
  ]);
  return {
    ads: ads.map((a) => view(a, now)),
    saved: total,
    libraryMax: AD_LIBRARY_MAX,
    running: slotRows.filter((a) => takesPlanSlot(a, now)).length,
    planLimit: plan?.liveAdLimit ?? 0,
    planName: plan?.name ?? null,
  };
}

/** 🔒 One ad of this business at a place this login works on ads for; else "not found". */
async function ownAd(account: BusinessAccount, adId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(adId)) throw notFound();
  const ad = await db.ad.findFirst({
    where: { id: adId, accountId: ownerOf(account) },
    include: withPlace,
  });
  if (!ad) throw notFound();
  try {
    const place = await requirePlace(account.id, ad.placeId, 'ads');
    return { ad, place };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) throw err;
    throw notFound();
  }
}

export async function getAd(account: BusinessAccount, adId: string, now = new Date()) {
  return view((await ownAd(account, adId)).ad, now);
}

/** ZIP codes must be ones the app counts (D116 ZIP areas). */
async function checkZips(zips: string[]) {
  if (!zips.length) return;
  const known = await db.$queryRaw<{ zip: string }[]>`
    SELECT zip FROM "ZipArea" WHERE zip = ANY(${zips}::text[])`;
  const unknown = zips.filter((z) => !known.some((k) => k.zip === z));
  if (unknown.length) {
    throw new ApiError(
      400,
      'VALIDATION',
      `These ZIP codes aren’t in the JaxSide area: ${unknown.join(', ')}.`,
    );
  }
}

/** Same screening as posts; JaxSide reviews every ad anyway, so only BLOCK stops it here. */
async function screenAd(input: Pick<AdDraft, 'headline' | 'body'>) {
  for (const text of [input.headline, input.body ?? ''].filter(Boolean)) {
    await screenText(text, 'new-content', { confirmWarning: true });
  }
}

function adData(input: AdDraft) {
  return {
    placeId: input.placeId,
    template: input.template,
    headline: input.headline,
    body: input.body?.trim() ? input.body.trim() : null,
    mediaId: input.mediaId,
    adultsOnly: input.adultsOnly,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    daysOfWeek: input.daysOfWeek,
    dailyStartMin: input.dailyStartMin,
    dailyEndMin: input.dailyEndMin,
    radiusMeters: input.radiusMeters,
    zips: input.zips,
  };
}

/** A saved ad in the editor's shape, for the "is it finished" checks. */
function asDraft(ad: Ad): AdDraft {
  return {
    placeId: ad.placeId,
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
    radiusMeters: ad.radiusMeters,
    zips: ad.zips,
  };
}

/** The picture must be one this business uploaded (never someone else's). */
async function checkMedia(account: BusinessAccount, mediaId: string | null) {
  if (!mediaId) return;
  const m = await db.adMedia.findUnique({ where: { id: mediaId } });
  if (!m || m.accountId !== ownerOf(account) || m.status !== 'ACTIVE') {
    throw new ApiError(400, 'VALIDATION', 'That picture isn’t available. Please upload it again.');
  }
}

/** Saves a new draft (the library holds at most 20 ads). */
export async function createAd(account: BusinessAccount, input: AdDraft, now = new Date()) {
  await requirePlace(account.id, input.placeId, 'ads');
  await Promise.all([checkMedia(account, input.mediaId), checkZips(input.zips), screenAd(input)]);
  const ownerId = ownerOf(account);
  const ad = await db.$transaction(async (tx) => {
    // Serialize per business so two saves can't both take the 20th slot.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ad-library:' + ownerId}))`;
    const saved = await tx.ad.count({ where: { accountId: ownerId } });
    if (saved >= AD_LIBRARY_MAX) {
      throw new ApiError(
        409,
        'LIBRARY_FULL',
        `You can keep ${AD_LIBRARY_MAX} ads. Delete an old one to make room.`,
      );
    }
    return tx.ad.create({
      data: { ...adData(input), accountId: ownerId, createdById: account.id, createdAt: now },
      include: withPlace,
    });
  });
  return view(ad, now);
}

/**
 * Saves changes. An approved, paused or waiting ad goes back for approval when the Owner
 * edits it (back to a draft when a Manager does, since only the Owner can send it); it
 * stops running until JaxSide approves it again. An ended ad becomes a draft to reuse.
 */
export async function updateAd(
  account: BusinessAccount,
  adId: string,
  input: AdDraft,
  now = new Date(),
) {
  const { ad, place } = await ownAd(account, adId);
  if (input.placeId !== ad.placeId) await requirePlace(account.id, input.placeId, 'ads');
  await Promise.all([checkMedia(account, input.mediaId), checkZips(input.zips), screenAd(input)]);
  let status = ad.status;
  if (status === 'APPROVED' || status === 'PAUSED' || status === 'PENDING_REVIEW') {
    status =
      can(place.role, 'publishAds') && adSubmitProblems(input, now).length === 0
        ? 'PENDING_REVIEW'
        : 'DRAFT';
  } else if (status === 'ENDED') {
    status = 'DRAFT';
  }
  const updated = await db.ad.update({
    where: { id: ad.id },
    data: {
      ...adData(input),
      status,
      ...(status === 'PENDING_REVIEW' ? { submittedAt: now } : {}),
      // After an edit it's never approved: JaxSide looks at it again.
      approvedAt: null,
    },
    include: withPlace,
  });
  return view(updated, now);
}

/** Owner: send a finished draft to JaxSide for approval. */
export async function submitAd(account: BusinessAccount, adId: string, now = new Date()) {
  const { ad } = await ownAd(account, adId);
  await requirePlace(account.id, ad.placeId, 'publishAds');
  if (ad.status !== 'DRAFT')
    throw new ApiError(409, 'STATE', 'Only a draft can be sent for approval.');
  const problems = adSubmitProblems(asDraft(ad), now);
  if (problems.length) {
    throw new ApiError(400, 'NOT_READY', problems.join(' '), { problems });
  }
  const plan = await currentPlan(account, now);
  if (!plan || plan.liveAdLimit === 0) {
    throw new ApiError(403, 'PLAN', 'Ads come with a plan. Contact JaxSide to get one.');
  }
  const updated = await db.ad.update({
    where: { id: ad.id },
    data: { status: 'PENDING_REVIEW', submittedAt: now },
    include: withPlace,
  });
  return view(updated, now);
}

/** How many of the business's ads take a plan slot now (Q35: live and scheduled). */
async function slotsInUse(ownerId: string, now: Date, except?: string) {
  const rows = await db.ad.findMany({
    where: { accountId: ownerId, status: 'APPROVED', ...(except ? { id: { not: except } } : {}) },
    select: { status: true, startsAt: true, endsAt: true },
  });
  return rows.filter((a) => takesPlanSlot(a, now)).length;
}

type Move = 'withdraw' | 'pause' | 'resume' | 'end';
const MOVES: Record<Move, { from: Ad['status'][]; to: Ad['status'] }> = {
  withdraw: { from: ['PENDING_REVIEW'], to: 'DRAFT' },
  pause: { from: ['APPROVED'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'APPROVED' },
  end: { from: ['APPROVED', 'PAUSED'], to: 'ENDED' },
};

/** Owner: take back from review, pause, resume (if the plan has room) or end an ad. */
export async function moveAd(account: BusinessAccount, adId: string, move: Move, now = new Date()) {
  const { ad } = await ownAd(account, adId);
  await requirePlace(account.id, ad.placeId, 'publishAds');
  const rule = MOVES[move];
  if (!rule.from.includes(ad.status)) {
    throw new ApiError(409, 'STATE', 'That can’t be done to this ad right now.');
  }
  if (move === 'resume') {
    const plan = await currentPlan(account, now);
    const problem = planLimitProblem(
      await slotsInUse(ownerOf(account), now, ad.id),
      plan?.liveAdLimit ?? 0,
    );
    if (problem) throw new ApiError(409, 'PLAN_FULL', problem);
  }
  const updated = await db.ad.update({
    where: { id: ad.id },
    data: { status: rule.to },
    include: withPlace,
  });
  return view(updated, now);
}

/** Delete an ad (frees a library slot). Not while it's live: pause or end it first. */
export async function deleteAd(account: BusinessAccount, adId: string, now = new Date()) {
  const { ad } = await ownAd(account, adId);
  if (adDisplayState(ad, now) === 'LIVE' || adDisplayState(ad, now) === 'SCHEDULED') {
    throw new ApiError(409, 'STATE', 'End this ad before deleting it.');
  }
  await db.ad.delete({ where: { id: ad.id } });
}
