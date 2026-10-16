import { z } from 'zod';
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
}

/** P6.9: an earned achievement as shown on a profile. */
export interface Medal {
  key: string;
  name: string;
  description: string;
  icon: string;
  awardedAt: string;
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
