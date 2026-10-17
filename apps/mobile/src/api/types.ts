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
  generalRadiusMiles: number | null;
  businessRadiusMiles: number | null;
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
