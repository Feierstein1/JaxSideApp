import { randomInt, timingSafeEqual } from 'node:crypto';
import type { OwnerClaimStatus, OwnerMethod, Prisma, User } from '@/generated/prisma/client';
import { normalizeUsername } from '@jax/shared';
import { hashToken } from '../auth/crypto';
import { db } from '../db';
import { ApiError } from '../http';
import { sendSafely } from '../mail/mailer';
import { inviteAfterVerification, revokeBusinessAccessForClaim } from './business-invites';
import { ownerCodeEmail } from '../mail/templates';
import { screenText } from '../moderation/screening';
import { pageWindow, toPage } from '../admin/paging';

/**
 * D103 (Phase 12, decided in D92): verified business owners. An owner gets an **Owner** tag
 * on their posts in that place's discussion only; everywhere else they stay pseudonymous.
 * Three free ways to verify:
 * - EMAIL: a 6-digit code to an address at the business's own web domain (the website we
 *   have on file for the place); entering it verifies automatically.
 * - WEBSITE: the app shows a short code; the owner posts it on the business's website or
 *   official social page and gives the link; an admin checks it in the portal.
 * - PHONE: an admin calls the business's public number and reads a code; the owner enters it.
 * One open claim per person and place. A place with a verified owner already needs an admin
 * to add another. Admins can remove the tag (audit-logged by the route).
 */

const CODE_MINUTES = 30;
const PHONE_CODE_DAYS = 14;
const MAX_ATTEMPTS = 5;

/** Free email services: an address there proves nothing about owning a business. */
const FREE_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
  'comcast.net',
  'att.net',
  'bellsouth.net',
  'verizon.net',
]);

/** "www.boldbean.com" and "boldbean.com" are the same business domain. */
const bare = (host: string) =>
  host
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');

/** Does this email address belong to the website's domain (or a subdomain of it)? */
export function emailMatchesWebsite(email: string, website: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const domain = bare(email.slice(at + 1));
  if (FREE_MAIL.has(domain)) return false;
  let host: string;
  try {
    host = bare(new URL(website).hostname);
  } catch {
    return false;
  }
  // Website on a free hosting/social platform (e.g. facebook.com/boldbean) proves nothing.
  if (FREE_MAIL.has(host) || /(^|\.)(facebook|instagram|google|yelp|wixsite)\.com$/.test(host)) {
    return false;
  }
  return domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`);
}

const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const publicCode = () =>
  `JAX-${Array.from({ length: 6 }, () => CODE_LETTERS[randomInt(0, CODE_LETTERS.length)]).join('')}`;

const NOT_FOUND = () => new ApiError(404, 'NOT_FOUND', 'Claim not found');

export interface OwnerClaimView {
  id: string;
  method: OwnerMethod;
  status: OwnerClaimStatus;
  /** WEBSITE: the code to post publicly. */
  publicCode: string | null;
  proofUrl: string | null;
  emailDomain: string | null;
  createdAt: string;
  verifiedAt: string | null;
  note: string | null;
  /** D157: the primary owner (manages the team), and the name shown instead of a username. */
  primary: boolean;
  staffName: string | null;
}

function view(c: {
  id: string;
  method: OwnerMethod;
  status: OwnerClaimStatus;
  publicCode: string | null;
  proofUrl: string | null;
  emailDomain: string | null;
  createdAt: Date;
  verifiedAt: Date | null;
  note: string | null;
  primary: boolean;
  staffName: string | null;
}): OwnerClaimView {
  return {
    id: c.id,
    method: c.method,
    status: c.status,
    publicCode: c.publicCode,
    proofUrl: c.proofUrl,
    emailDomain: c.emailDomain,
    createdAt: c.createdAt.toISOString(),
    verifiedAt: c.verifiedAt?.toISOString() ?? null,
    note: c.note,
    primary: c.primary,
    staffName: c.staffName,
  };
}

/** For the "I own this place" screen: your claims and which methods this place supports. */
export async function myOwnerClaims(userId: string, placeId: string) {
  const place = await db.businessPlace.findFirst({
    where: { id: placeId, status: 'ACTIVE' },
    select: { name: true, website: true, phone: true },
  });
  if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
  const claims = await db.ownerClaim.findMany({
    where: { placeId, userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return {
    place: { name: place.name, website: place.website, phone: place.phone },
    claims: claims.map(view),
  };
}

export async function startOwnerClaim(
  user: Pick<User, 'id'>,
  placeId: string,
  input: { method: OwnerMethod; email?: string },
  now = new Date(),
) {
  const place = await db.businessPlace.findFirst({ where: { id: placeId, status: 'ACTIVE' } });
  if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
  const mine = await db.ownerClaim.findFirst({
    where: { placeId, userId: user.id, status: { in: ['PENDING', 'VERIFIED'] } },
  });
  if (mine?.status === 'VERIFIED') {
    throw new ApiError(409, 'ALREADY_OWNER', 'You’re already a verified owner of this place.');
  }
  if (mine) {
    throw new ApiError(
      409,
      'CLAIM_OPEN',
      'You already have a claim in progress. Cancel it to start over.',
    );
  }

  if (input.method === 'EMAIL') {
    if (!place.website) {
      throw new ApiError(
        409,
        'NO_WEBSITE',
        'We don’t have a website for this place, so email checks aren’t possible. Choose another way.',
      );
    }
    const email = (input.email ?? '').trim();
    if (!emailMatchesWebsite(email, place.website)) {
      throw new ApiError(
        422,
        'EMAIL_NOT_BUSINESS',
        `Use an address at the business’s own website (${bare(new URL(place.website).hostname)}), not Gmail, Yahoo or similar.`,
      );
    }
    const code = sixDigits();
    const claim = await db.ownerClaim.create({
      data: {
        placeId,
        userId: user.id,
        method: 'EMAIL',
        emailDomain: bare(email.slice(email.lastIndexOf('@') + 1)),
        codeHash: hashToken(code),
        codeExpiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000),
        createdAt: now,
      },
    });
    // The address is used once, here, and never stored.
    await sendSafely(ownerCodeEmail(email, code, place.name), 'owner-code');
    return view(claim);
  }
  if (input.method === 'PHONE') {
    if (!place.phone) {
      throw new ApiError(
        409,
        'NO_PHONE',
        'We don’t have a phone number for this place. Choose another way.',
      );
    }
    const code = sixDigits();
    const claim = await db.ownerClaim.create({
      data: {
        placeId,
        userId: user.id,
        method: 'PHONE',
        phoneCode: code,
        codeHash: hashToken(code),
        codeExpiresAt: new Date(now.getTime() + PHONE_CODE_DAYS * 86_400_000),
        createdAt: now,
      },
    });
    return view(claim);
  }
  const claim = await db.ownerClaim.create({
    data: { placeId, userId: user.id, method: 'WEBSITE', publicCode: publicCode(), createdAt: now },
  });
  return view(claim);
}

async function myOpenClaim(userId: string, claimId: string) {
  const c = await db.ownerClaim.findFirst({
    where: { id: claimId, userId, status: 'PENDING' },
  });
  if (!c) throw NOT_FOUND();
  return c;
}

/** EMAIL / PHONE: enter the code. Verifies, unless the place already has an owner. */
export async function confirmOwnerCode(
  userId: string,
  claimId: string,
  code: string,
  now = new Date(),
) {
  const c = await myOpenClaim(userId, claimId);
  if (c.method === 'WEBSITE' || !c.codeHash) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'This claim is checked by an admin.');
  }
  if (c.attempts >= MAX_ATTEMPTS) {
    throw new ApiError(
      429,
      'TOO_MANY_TRIES',
      'Too many wrong codes. Cancel this claim and start again.',
    );
  }
  if (!c.codeExpiresAt || c.codeExpiresAt < now) {
    throw new ApiError(
      410,
      'CODE_EXPIRED',
      'That code has expired. Cancel this claim and start again.',
    );
  }
  const a = Buffer.from(hashToken(code.trim()));
  const b = Buffer.from(c.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.ownerClaim.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError(422, 'WRONG_CODE', 'That code isn’t right.');
  }
  const existingOwner = await db.ownerClaim.findFirst({
    where: { placeId: c.placeId, status: 'VERIFIED', userId: { not: userId } },
    select: { id: true },
  });
  if (existingOwner) {
    // D92: one owner per place unless an admin adds more.
    const updated = await db.ownerClaim.update({
      where: { id: c.id },
      data: {
        codeHash: null,
        note: 'Code confirmed; this place already has an owner, so an admin will decide.',
      },
    });
    return view(updated);
  }
  const updated = await db.ownerClaim.update({
    where: { id: c.id },
    data: {
      status: 'VERIFIED',
      verifiedAt: now,
      codeHash: null,
      phoneCode: null,
      primary: await primaryIfFirst(c.placeId), // D157
    },
  });
  if (updated.primary) await inviteAfterVerification(updated.id, now); // D172
  return view(updated);
}

/** WEBSITE: where the code was posted (http(s) link). Then an admin checks it. */
export async function submitOwnerProof(userId: string, claimId: string, proofUrl: string) {
  const c = await myOpenClaim(userId, claimId);
  if (c.method !== 'WEBSITE')
    throw new ApiError(400, 'VALIDATION_ERROR', 'This claim uses a code.');
  const updated = await db.ownerClaim.update({ where: { id: c.id }, data: { proofUrl } });
  return view(updated);
}

export async function cancelOwnerClaim(userId: string, claimId: string, now = new Date()) {
  const c = await myOpenClaim(userId, claimId);
  await db.ownerClaim.update({
    where: { id: c.id },
    data: { status: 'CANCELLED', decidedAt: now, codeHash: null, phoneCode: null },
  });
}

// ───────────────────────────── Admin ─────────────────────────────

/** Claims an admin must act on: website proofs, phone calls, and second owners. */
export async function listOwnerClaims(
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVOKED',
  page = 1,
) {
  const where: Prisma.OwnerClaimWhereInput =
    status === 'PENDING'
      ? {
          status: 'PENDING',
          OR: [
            { method: 'WEBSITE', proofUrl: { not: null } },
            { method: 'PHONE' },
            { method: 'EMAIL', codeHash: null }, // code confirmed, place already had an owner
          ],
        }
      : { status };
  const [rows, total] = await Promise.all([
    db.ownerClaim.findMany({
      where,
      orderBy: [{ createdAt: status === 'PENDING' ? 'asc' : 'desc' }, { id: 'asc' }],
      ...pageWindow(page),
      include: {
        place: { select: { id: true, name: true, website: true, phone: true } },
        user: { select: { id: true, username: true } },
        decidedBy: { select: { username: true } },
      },
    }),
    db.ownerClaim.count({ where }),
  ]);
  return toPage(rows, total, page);
}

export async function decideOwnerClaim(
  adminId: string,
  claimId: string,
  action: 'approve' | 'reject' | 'revoke' | 'make-primary',
  note: string | undefined,
  now = new Date(),
) {
  const c = await db.ownerClaim.findUnique({ where: { id: claimId } });
  if (!c) throw NOT_FOUND();
  if (action === 'make-primary') return makePrimaryOwner(claimId);
  if (action === 'revoke') {
    if (c.status !== 'VERIFIED')
      throw new ApiError(409, 'NOT_VERIFIED', 'Only verified owners can lose the tag.');
    await db.ownerClaim.update({
      where: { id: c.id },
      data: { status: 'REVOKED', decidedAt: now, decidedById: adminId, note: note ?? null },
    });
    await revokeBusinessAccessForClaim(c.id, now); // D172
    return;
  }
  if (c.status !== 'PENDING') throw new ApiError(409, 'ALREADY_DECIDED', 'Already decided');
  const decided = await db.ownerClaim.update({
    where: { id: c.id },
    data:
      action === 'approve'
        ? {
            status: 'VERIFIED',
            verifiedAt: now,
            decidedAt: now,
            decidedById: adminId,
            primary: await primaryIfFirst(c.placeId), // D157
            codeHash: null,
            phoneCode: null,
            note: note ?? null,
          }
        : {
            status: 'REJECTED',
            decidedAt: now,
            decidedById: adminId,
            codeHash: null,
            phoneCode: null,
            note: note ?? null,
          },
  });
  if (decided.status === 'VERIFIED' && decided.primary) {
    await inviteAfterVerification(decided.id, now); // D172
  }
}

// ───────────── D157: the owner team ("The Owner") ─────────────

/** The primary owner's claim for a place, or 403. */
async function primaryClaim(userId: string, placeId: string) {
  const c = await db.ownerClaim.findFirst({
    where: { placeId, userId, status: 'VERIFIED', primary: true },
  });
  if (!c)
    throw new ApiError(403, 'NOT_PRIMARY_OWNER', 'Only the primary owner can manage the team.');
  return c;
}

/** A verified owner (primary or team) of the place: they see the team. */
async function anyOwnerClaim(userId: string, placeId: string) {
  const c = await db.ownerClaim.findFirst({ where: { placeId, userId, status: 'VERIFIED' } });
  if (!c) throw new ApiError(403, 'NOT_OWNER', 'Only this place’s owners can see the team.');
  return c;
}

export interface OwnerTeamMember {
  claimId: string;
  username: string;
  staffName: string | null;
  primary: boolean;
  since: string;
  isMe: boolean;
}

/** The team (only its members see it; usernames are shown only to them). */
export async function ownerTeam(userId: string, placeId: string): Promise<OwnerTeamMember[]> {
  await anyOwnerClaim(userId, placeId);
  const rows = await db.ownerClaim.findMany({
    where: { placeId, status: 'VERIFIED' },
    orderBy: [{ primary: 'desc' }, { verifiedAt: 'asc' }],
    include: { user: { select: { username: true } } },
  });
  return rows.map((r) => ({
    claimId: r.id,
    username: r.user.username,
    staffName: r.staffName,
    primary: r.primary,
    since: (r.verifiedAt ?? r.createdAt).toISOString(),
    isMe: r.userId === userId,
  }));
}

/** The primary owner adds someone by username (an active, confirmed account). */
export async function addTeamMember(
  userId: string,
  placeId: string,
  input: { username: string; staffName?: string },
  now = new Date(),
) {
  await primaryClaim(userId, placeId);
  if (input.staffName) await screenText(input.staffName, 'bio');
  const member = await db.user.findUnique({
    where: { usernameNormalized: normalizeUsername(input.username) },
    select: { id: true, status: true, emailVerifiedAt: true },
  });
  if (!member || member.status !== 'ACTIVE' || !member.emailVerifiedAt) {
    throw new ApiError(404, 'NOT_FOUND', 'No confirmed account with that username.');
  }
  const already = await db.ownerClaim.findFirst({
    where: { placeId, userId: member.id, status: 'VERIFIED' },
    select: { id: true },
  });
  if (already) throw new ApiError(409, 'ALREADY_OWNER', 'They’re already on the team.');
  await db.ownerClaim.create({
    data: {
      placeId,
      userId: member.id,
      method: 'TEAM',
      status: 'VERIFIED',
      verifiedAt: now,
      addedById: userId,
      staffName: input.staffName?.trim() || null,
    },
  });
}

/** The primary owner sets anyone's staff name; a member can change their own. */
export async function setStaffName(
  userId: string,
  placeId: string,
  claimId: string,
  staffName: string | null,
) {
  const mine = await anyOwnerClaim(userId, placeId);
  const target = await db.ownerClaim.findFirst({
    where: { id: claimId, placeId, status: 'VERIFIED' },
  });
  if (!target) throw NOT_FOUND();
  if (!mine.primary && target.userId !== userId) {
    throw new ApiError(403, 'NOT_PRIMARY_OWNER', 'Only the primary owner can change others.');
  }
  if (staffName) await screenText(staffName, 'bio');
  await db.ownerClaim.update({
    where: { id: claimId },
    data: { staffName: staffName?.trim() || null },
  });
}

/** The primary owner removes a team member (not themselves; an admin moves the primary role). */
export async function removeTeamMember(
  userId: string,
  placeId: string,
  claimId: string,
  now = new Date(),
) {
  const mine = await primaryClaim(userId, placeId);
  if (mine.id === claimId) {
    throw new ApiError(409, 'PRIMARY', 'The primary owner can’t remove themselves. Contact us.');
  }
  const r = await db.ownerClaim.updateMany({
    where: { id: claimId, placeId, status: 'VERIFIED' },
    data: { status: 'REVOKED', decidedAt: now, note: 'Removed by the primary owner' },
  });
  if (!r.count) throw NOT_FOUND();
}

/** Admin: make this verified owner the place's primary owner (the old one stays on the team). */
export async function makePrimaryOwner(claimId: string) {
  await db.$transaction(async (tx) => {
    const c = await tx.ownerClaim.findFirst({ where: { id: claimId, status: 'VERIFIED' } });
    if (!c) throw NOT_FOUND();
    await tx.ownerClaim.updateMany({
      where: { placeId: c.placeId, primary: true },
      data: { primary: false },
    });
    await tx.ownerClaim.update({ where: { id: c.id }, data: { primary: true } });
  });
}

/** The first verified owner of a place becomes its primary owner. */
async function primaryIfFirst(placeId: string) {
  const has = await db.ownerClaim.findFirst({
    where: { placeId, status: 'VERIFIED', primary: true },
    select: { id: true },
  });
  return !has;
}
