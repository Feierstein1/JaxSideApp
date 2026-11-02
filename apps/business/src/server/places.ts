import type { BusinessRole } from '@/generated/prisma/client';
import { db } from './db';
import { ApiError } from './http';

/**
 * B1.4: the places a business account runs. Access is per place (BusinessPlaceAccess);
 * a revoked access, or a place the directory removed, is as if it never existed.
 */

export type PlaceView = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  role: BusinessRole;
  staffName: string | null;
};

/** What each role may do (D165): Owner everything, Manager posts + ad drafts, Staff posts. */
export const CAN = {
  discussion: ['OWNER', 'MANAGER', 'STAFF'],
  team: ['OWNER'],
  ads: ['OWNER', 'MANAGER'],
  // Sending ads for approval, pausing, resuming and ending them (D165: Managers only draft).
  publishAds: ['OWNER'],
  billing: ['OWNER'],
  insights: ['OWNER'],
} as const satisfies Record<string, readonly BusinessRole[]>;

export type Ability = keyof typeof CAN;

export function can(role: BusinessRole, ability: Ability): boolean {
  return (CAN[ability] as readonly BusinessRole[]).includes(role);
}

const liveAccess = (accountId: string) => ({
  accountId,
  revokedAt: null,
  place: { status: 'ACTIVE' as const },
});

export async function myPlaces(accountId: string): Promise<PlaceView[]> {
  const rows = await db.businessPlaceAccess.findMany({
    where: liveAccess(accountId),
    include: { place: { select: { id: true, name: true, category: true, address: true } } },
    orderBy: { place: { name: 'asc' } },
  });
  return rows.map((a) => ({
    id: a.place.id,
    name: a.place.name,
    category: a.place.category,
    address: a.place.address,
    role: a.role,
    staffName: a.staffName,
  }));
}

/**
 * 🔒 The ownership check for anything about one place: the account must have live access
 * to it (and, if given, an allowed role). Anything else is "not found", so nobody learns
 * which places exist on the business site.
 */
export async function requirePlace(
  accountId: string,
  placeId: string,
  ability?: Ability,
): Promise<PlaceView> {
  const notFound = () => new ApiError(404, 'NOT_FOUND', 'Place not found.');
  if (!/^[0-9a-f-]{36}$/i.test(placeId)) throw notFound();
  const a = await db.businessPlaceAccess.findFirst({
    where: { ...liveAccess(accountId), placeId },
    include: { place: { select: { id: true, name: true, category: true, address: true } } },
  });
  if (!a) throw notFound();
  if (ability && !can(a.role, ability)) {
    throw new ApiError(403, 'ROLE', 'Your role at this place can’t do that.');
  }
  return {
    id: a.place.id,
    name: a.place.name,
    category: a.place.category,
    address: a.place.address,
    role: a.role,
    staffName: a.staffName,
  };
}
