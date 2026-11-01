import type { BusinessAccount, Prisma } from '@/generated/prisma/client';
import { createSession, type SessionGrant } from './auth';
import { hashPassword, hashToken } from './crypto';
import { db } from './db';
import { ApiError } from './http';
import { LIMITS, clientIp, enforce, subject } from './rate-limit';

/**
 * B1.3 / D172: the invite link the app server emailed to a verified primary owner. Opening
 * it shows the invite; pressing a button uses it, either creating a business account or
 * adding the place to the business account that's signed in. The owner's other verified
 * places come along too, so one account runs all of them.
 */

const invalid = () =>
  new ApiError(
    410,
    'INVITE_INVALID',
    'This link has expired or was already used. Ask JaxSide for a new one.',
  );

type Tx = Prisma.TransactionClient;

async function liveInvite(token: string, now: Date, client: Tx | typeof db = db) {
  const invite = await client.businessInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      place: { select: { name: true } },
      ownerClaim: { select: { id: true, status: true, primary: true, userId: true } },
    },
  });
  if (!invite || invite.usedAt || invite.expiresAt <= now) throw invalid();
  // The claim must still stand: an owner whose tag was removed can't use an old link.
  if (invite.ownerClaim.status !== 'VERIFIED' || !invite.ownerClaim.primary) throw invalid();
  const owned = await client.businessPlaceAccess.findFirst({
    where: { placeId: invite.placeId, role: 'OWNER', revokedAt: null },
    select: { id: true },
  });
  if (owned) {
    throw new ApiError(
      409,
      'PLACE_HAS_OWNER',
      'This place already has an owner on JaxSide for Business. Contact JaxSide if that isn’t you.',
    );
  }
  return invite;
}

/** For the invite page: the place's name, or why the link can't be used. */
export async function invitePreview(
  token: string | undefined,
  now = new Date(),
): Promise<{ ok: true; placeName: string } | { ok: false; message: string }> {
  if (!token || token.length > 100) return { ok: false, message: invalid().message };
  try {
    const invite = await liveInvite(token, now);
    return { ok: true, placeName: invite.place.name };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, message: err.message };
    throw err;
  }
}

/**
 * Owner access to the invited place plus the same person's other verified primary claims
 * whose places have no owner here yet. The invite (and any other open invite for those
 * claims) is used up. Returns the names of the places added.
 */
async function grantOwnerPlaces(
  tx: Tx,
  accountId: string,
  invite: Awaited<ReturnType<typeof liveInvite>>,
  now: Date,
): Promise<string[]> {
  const used = await tx.businessInvite.updateMany({
    where: { id: invite.id, usedAt: null },
    data: { usedAt: now, usedByAccountId: accountId },
  });
  if (used.count !== 1) throw invalid(); // someone used it a moment ago

  const claims = await tx.ownerClaim.findMany({
    where: {
      userId: invite.ownerClaim.userId,
      status: 'VERIFIED',
      primary: true,
      place: { businessAccess: { none: { role: 'OWNER', revokedAt: null } } },
    },
    select: { id: true, placeId: true, place: { select: { name: true } } },
  });
  for (const c of claims) {
    await tx.businessPlaceAccess.create({
      data: { accountId, placeId: c.placeId, role: 'OWNER', ownerClaimId: c.id, createdAt: now },
    });
  }
  await tx.businessInvite.updateMany({
    where: { ownerClaimId: { in: claims.map((c) => c.id) }, usedAt: null },
    data: { usedAt: now, usedByAccountId: accountId },
  });
  return claims.map((c) => c.place.name);
}

/** A unique-index clash means someone else got there first (account email or place owner). */
function clash(err: unknown, message: string): never {
  if ((err as { code?: string })?.code === 'P2002') throw new ApiError(409, 'CONFLICT', message);
  throw err;
}

/** Creates the business account from an invite and signs it in. */
export async function acceptInviteNew(
  input: { token: string; email: string; password: string },
  req: Request,
  now = new Date(),
): Promise<{ account: BusinessAccount; places: string[] } & SessionGrant> {
  await enforce([{ key: `invite:ip:${subject(clientIp(req))}`, ...LIMITS.inviteAcceptPerIp }], now);
  const taken = await db.businessAccount.findUnique({ where: { email: input.email } });
  if (taken) {
    throw new ApiError(
      409,
      'EMAIL_TAKEN',
      'A business account already uses this email. Sign in, then open the link again.',
    );
  }
  const passwordHash = await hashPassword(input.password);
  const { account, places } = await db
    .$transaction(async (tx) => {
      const invite = await liveInvite(input.token, now, tx);
      const account = await tx.businessAccount.create({
        data: { email: input.email, passwordHash, passwordChangedAt: now, createdAt: now },
      });
      return { account, places: await grantOwnerPlaces(tx, account.id, invite, now) };
    })
    .catch((err) => clash(err, 'That email or place was just taken. Please try again.'));
  return { account, places, ...(await createSession(account.id, now)) };
}

/** Adds the invited place (and the owner's other verified places) to a signed-in account. */
export async function acceptInviteExisting(
  account: BusinessAccount,
  token: string,
  now = new Date(),
): Promise<string[]> {
  // Employee logins belong to someone else's business; only an owner's own account can.
  if (account.createdById) {
    throw new ApiError(
      403,
      'NOT_AN_OWNER_ACCOUNT',
      'Staff logins can’t take on places. Sign out and use your own business account.',
    );
  }
  return db
    .$transaction(async (tx) =>
      grantOwnerPlaces(tx, account.id, await liveInvite(token, now, tx), now),
    )
    .catch((err) => clash(err, 'This place was just set up by someone else.'));
}
