import { generateToken, hashToken } from '../auth/crypto';
import { decryptUserEmail } from '../crypto/field-encryption';
import { db } from '../db';
import { getEnv } from '../env';
import { ApiError } from '../http';
import { logger } from '../logger';
import { sendSafely } from '../mail/mailer';
import { businessInviteEmail } from '../mail/templates';

/**
 * D172: the one place the app server meets the business website: a verified primary
 * owner gets an invite row in the shared database and an email with the link. The
 * website reads the row when the link is opened; this server never calls the website.
 */

export const INVITE_DAYS = 7;

export type InviteOutcome = 'sent' | 'not-primary-owner' | 'already-on-business-site' | 'no-email';

/**
 * Creates a fresh invite for a verified primary owner's claim and emails it. Older unused
 * invites for the same claim stop working, so only the newest link is live.
 */
export async function sendBusinessInvite(
  claimId: string,
  now = new Date(),
): Promise<InviteOutcome> {
  const claim = await db.ownerClaim.findUnique({
    where: { id: claimId },
    include: { place: { select: { name: true } }, user: true },
  });
  if (!claim || claim.status !== 'VERIFIED' || !claim.primary) return 'not-primary-owner';
  const owned = await db.businessPlaceAccess.findFirst({
    where: { placeId: claim.placeId, role: 'OWNER', revokedAt: null },
    select: { id: true },
  });
  if (owned) return 'already-on-business-site';
  if (claim.user.status !== 'ACTIVE') return 'no-email';
  let email: string;
  try {
    email = decryptUserEmail(claim.user);
  } catch {
    return 'no-email';
  }

  const token = generateToken();
  await db.$transaction([
    db.businessInvite.updateMany({
      where: { ownerClaimId: claim.id, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    db.businessInvite.create({
      data: {
        tokenHash: hashToken(token),
        placeId: claim.placeId,
        ownerClaimId: claim.id,
        expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
        createdAt: now,
      },
    }),
  ]);
  const url = `${getEnv().BUSINESS_BASE_URL}/invite?token=${encodeURIComponent(token)}`;
  await sendSafely(
    businessInviteEmail(email, claim.place.name, url, INVITE_DAYS),
    'business-invite',
  );
  return 'sent';
}

/** After a claim is verified: send the invite, never failing the verification itself. */
export async function inviteAfterVerification(claimId: string, now = new Date()) {
  try {
    await sendBusinessInvite(claimId, now);
  } catch (err) {
    logger.error({ err, claimId }, 'business invite failed');
  }
}

/** Admin "send business-site invite": explains in plain words when nothing was sent. */
export async function adminSendBusinessInvite(claimId: string, now = new Date()) {
  const outcome = await sendBusinessInvite(claimId, now);
  const why: Record<Exclude<InviteOutcome, 'sent'>, string> = {
    'not-primary-owner': 'Only a verified primary owner can be invited.',
    'already-on-business-site': 'This place already has an owner on the business site.',
    'no-email': 'This owner’s account has no email we can use (closed or banned).',
  };
  if (outcome !== 'sent') throw new ApiError(409, 'INVITE_NOT_SENT', why[outcome]);
}

/** D172: an owner who loses the tag also loses the business site's access to that place. */
export async function revokeBusinessAccessForClaim(claimId: string, now = new Date()) {
  const linked = await db.businessPlaceAccess.findMany({
    where: { ownerClaimId: claimId, revokedAt: null },
    select: { placeId: true, accountId: true },
  });
  for (const a of linked) {
    // B1.8: the owner is told in the business inbox (the place itself is no longer theirs).
    const place = await db.businessPlace.findUnique({
      where: { id: a.placeId },
      select: { name: true },
    });
    await db.businessNotice.create({
      data: {
        accountId: a.accountId,
        kind: 'PLACE_REMOVED',
        title: `${place?.name ?? 'A place'} was removed from your account`,
        body: 'JaxSide removed your Owner tag for this place. Contact JaxSide if you think this is a mistake.',
        createdAt: now,
      },
    });
    // The owner's account and every employee login it made lose this place.
    await db.businessPlaceAccess.updateMany({
      where: {
        placeId: a.placeId,
        revokedAt: null,
        OR: [{ accountId: a.accountId }, { account: { createdById: a.accountId } }],
      },
      data: { revokedAt: now },
    });
  }
  await db.businessInvite.updateMany({
    where: { ownerClaimId: claimId, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
}
