/** Response shapes from the server's serializers (apps/server/src/server/serializers.ts). */

export interface MeUser {
  id: string;
  username: string;
  bio: string | null;
  joinedAt: string;
  avatarUrl: string | null;
  /** D69: account color key (palette in @jax/shared). */
  color: string;
  email: string;
  emailVerified: boolean;
  /** D71: your radius in miles (0.1 / 0.2 / 0.3); null = default 0.3. */
  radiusMiles: number | null;
  /** D76: left out of the friends feed. */
  hidePostsFromFriends: boolean;
  /** D116: left out of the anonymous area statistics. */
  areaStatsOptOut: boolean;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: MeUser;
}

export interface StatusMessage {
  status: string;
  message?: string;
}

/** P4.4: a guest's server-computed expiry. */
export interface GuestStatus {
  expiresAt: string;
  daysLeft: number;
  expiringSoon: boolean;
}

export type SessionResponse =
  { kind: 'user'; user: MeUser } | { kind: 'guest'; guest: GuestStatus };
