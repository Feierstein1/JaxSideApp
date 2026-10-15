/**
 * Serializers are the ONLY way user data leaves the server (P1.19, §17).
 * Each one builds its output from an explicit allow-list, so new DB columns are
 * never exposed by accident.
 */

interface UserLike {
  id: string;
  username: string;
  createdAt: Date;
  email?: string;
  emailVerifiedAt?: Date | null;
  generalRadiusMiles?: number | null;
  businessRadiusMiles?: number | null;
  profile?: { bio: string | null; avatarPhotoId: string | null } | null;
}

/** Anything other users can see. */
export interface PublicUser {
  id: string;
  username: string;
  bio: string | null;
  joinedAt: string;
}

export function toPublicUser(u: UserLike): PublicUser {
  return {
    id: u.id,
    username: u.username,
    bio: u.profile?.bio ?? null,
    joinedAt: u.createdAt.toISOString(),
  };
}

/** The signed-in user's own account view. Includes their email, never hashes, birth year or status internals. */
export interface MeUser extends PublicUser {
  email: string;
  emailVerified: boolean;
  generalRadiusMiles: number | null;
  businessRadiusMiles: number | null;
}

export function toMe(u: UserLike & { email: string; emailVerifiedAt: Date | null }): MeUser {
  return {
    ...toPublicUser(u),
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    generalRadiusMiles: u.generalRadiusMiles ?? null,
    businessRadiusMiles: u.businessRadiusMiles ?? null,
  };
}

/** Keys that must never appear in a public response, at any depth. Used by tests and checks. */
export const FORBIDDEN_PUBLIC_KEYS = [
  'email',
  'birthYear',
  'passwordHash',
  'totpSecretEnc',
  'tokenHash',
  'csrfTokenHash',
  'internalNote',
  'suspendedUntil',
  'point',
] as const;

export function findForbiddenKeys(value: unknown, allow: readonly string[] = []): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if ((FORBIDDEN_PUBLIC_KEYS as readonly string[]).includes(k) && !allow.includes(k))
          found.add(k);
        walk(child);
      }
    }
  };
  walk(value);
  return [...found];
}
