/** Response shapes from the server's serializers (apps/server/src/server/serializers.ts). */

export interface MeUser {
  id: string;
  username: string;
  bio: string | null;
  joinedAt: string;
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
