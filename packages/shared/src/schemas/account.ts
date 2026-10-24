import { z } from 'zod';
import { PROFILE_COLOR_KEYS } from '../profile-colors';
import {
  emailCodeSchema,
  emailSchema,
  loginRequestSchema,
  passwordSchema,
  usernameSchema,
} from './auth';

/** P4.9: change your username (cooldown applies). */
export const usernameChangeSchema = z.strictObject({ username: usernameSchema });

/** P4.10: change password; other devices are signed out. */
export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

/** P4.10: start an email change; a code goes to the new address. */
export const emailChangeSchema = z.strictObject({
  newEmail: emailSchema,
  password: z.string().min(1).max(200),
});

export const emailChangeConfirmSchema = z.strictObject({ code: emailCodeSchema });

/** P4.12: delete your account. Typing DELETE guards against accidents. */
export const accountDeleteSchema = z.strictObject({
  password: z.string().min(1).max(200),
  confirm: z.literal('DELETE', { error: 'Type DELETE to confirm' }),
});

/** Public profile (P4.8). Never email, birth year or status details. */
export interface PublicProfile {
  username: string;
  bio: string | null;
  joinedAt: string;
  postCount: number;
  isMe: boolean;
  /** Whether *you* have blocked this person (P5.2). */
  blockedByMe: boolean;
  /** P6.9: medals earned. */
  medals: Medal[];
  /** P6.5: short-lived signed link, or null. */
  avatarUrl: string | null;
  /** D69: account color key. */
  color: string;
  /** D76: your relationship with them, and the pending request's ID if any. */
  friendship: 'none' | 'requested' | 'incoming' | 'friends';
  friendRequestId: string | null;
}

/** D122: medal levels, lowest first (`tier` 1 = Bronze). */
export const MEDAL_TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const;
export type MedalTierName = (typeof MEDAL_TIER_NAMES)[number];

/** P6.9 / D122: an earned achievement as shown on a profile. */
export interface Medal {
  key: string;
  name: string;
  description: string;
  icon: string;
  /** 1 Bronze … 4 Platinum. */
  tier: number;
  tierName: MedalTierName;
  /** How many levels this medal has (1 for a one-time medal). */
  levels: number;
  /** The next level and what it takes, or null at the top. */
  next: { tierName: MedalTierName; needs: string } | null;
  awardedAt: string;
  /** When the current level was reached. */
  tierAt: string;
}

/** D122: a medal next to a name on posts and comments: which one, at what level. */
export interface MedalBadge {
  key: string;
  tier: number;
}

/** P5.7: appeal one strike. */
export const APPEAL_MAX = 1000;
const appealFields = {
  actionId: z.uuid(),
  message: z.string().trim().min(10, 'Please explain in a sentence or two').max(APPEAL_MAX),
};
export const appealCreateSchema = z.strictObject(appealFields);

/** Banned or suspended people can't sign in, so they prove it's them with their password. */
const restrictedCredentials = {
  identifier: z.string().trim().min(1).max(254),
  password: loginRequestSchema.shape.password,
};
export const restrictedStandingSchema = z.strictObject(restrictedCredentials);
export const restrictedAppealSchema = z.strictObject({ ...restrictedCredentials, ...appealFields });

/** P6.5: set your profile photo (uploaded first with `POST /photos`). */
export const avatarSchema = z.strictObject({ photoId: z.uuid() });

/** D69: pick your account color. */
export const profileColorSchema = z.strictObject({ color: z.enum(PROFILE_COLOR_KEYS) });
