import { z } from 'zod';
import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN, isReservedUsername } from '../username';

/**
 * Request schemas use z.strictObject so unexpected fields (e.g. `role`, `status`)
 * are rejected rather than silently stripped (§17).
 */

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`)
  .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters`)
  .regex(USERNAME_PATTERN, 'Use only letters, numbers and underscores')
  .refine((u) => !isReservedUsername(u), 'That username is not available');

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** D24: length-based policy (NIST 800-63B). Max bounds hashing cost. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`);

/** Shape only. The configurable cutoff is enforced on the server (P1.14). */
export const birthYearSchema = z.number().int().min(1900).max(2100);

export const registerRequestSchema = z.strictObject({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  birthYear: birthYearSchema,
  acceptTerms: z.literal(true, { error: 'You must accept the Terms of Service' }),
  confirmAdult: z.literal(true, { error: 'You must confirm you are 18 or older' }),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.strictObject({
  // Login accepts username or email.
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const passwordResetRequestSchema = z.strictObject({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.strictObject({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.strictObject({
  token: z.string().min(20).max(200),
});
