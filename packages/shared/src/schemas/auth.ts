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
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`)
  // D32: phone keyboards can add an invisible trailing space. Refuse it when a
  // password is set, so sign-in can safely ignore edge spaces.
  .refine((p) => p === p.trim(), "Password can't start or end with a space");

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
  // D32: no valid password has edge spaces, so stray keyboard spaces are dropped.
  password: z
    .string()
    .max(PASSWORD_MAX + 10)
    .trim()
    .min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const passwordResetRequestSchema = z.strictObject({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.strictObject({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});

/** D31: 6-digit email code. Spaces and dashes are allowed when typing ("482 913"). */
export const EMAIL_CODE_LENGTH = 6;
export const emailCodeSchema = z
  .string()
  .max(20)
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'));

export const verifyEmailCodeSchema = z.strictObject({
  code: emailCodeSchema,
});

export const passwordResetCodeSchema = z.strictObject({
  email: emailSchema,
  code: emailCodeSchema,
  newPassword: passwordSchema,
});

/** For POST endpoints that take no input: any field at all is rejected. */
export const emptyBodySchema = z.strictObject({});

export const verifyEmailSchema = z.strictObject({
  token: z.string().min(20).max(200),
});
