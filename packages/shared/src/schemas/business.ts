import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth';
import { STAFF_NAME_MAX } from './directory';
import { commentBodySchema, postBodySchema } from './discussion';

/**
 * Business website (D169). Shapes only; accounts are checked on the business server.
 * Owners sign in with an email, employees with the username their owner gave them.
 */
export const businessIdentifierSchema = z.string().trim().toLowerCase().min(1).max(254);

export const businessLoginSchema = z.strictObject({
  identifier: businessIdentifierSchema,
  password: z.string().min(1).max(128),
});
export type BusinessLoginInput = z.infer<typeof businessLoginSchema>;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const businessTwoFactorLoginSchema = z.strictObject({
  challenge: z.string().min(1).max(300),
  code: totpCodeSchema,
});

export const businessPasswordChangeSchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Choose a password different from the current one',
    path: ['newPassword'],
  });

export const businessTwoFactorConfirmSchema = z.strictObject({ code: totpCodeSchema });

export const businessTwoFactorDisableSchema = z.strictObject({
  password: z.string().min(1).max(128),
  code: totpCodeSchema,
});

/** D172: the invite link's token (from the email the app server sent). */
const inviteTokenSchema = z.string().min(20).max(100);

/** Create a business account from an invite: the owner's business email and a password. */
export const businessInviteAcceptNewSchema = z.strictObject({
  token: inviteTokenSchema,
  email: emailSchema,
  password: passwordSchema,
});

/** Add the invited place to the business account that's signed in. */
export const businessInviteAcceptSchema = z.strictObject({ token: inviteTokenSchema });

// ───────────── B1.5: employees (logins the Owner creates) ─────────────

/** Employee sign-in names: lower-case letters, digits, dot, dash, underscore; never "@". */
export const businessUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,29}$/, 'Use 3–30 letters, numbers, dots, dashes or underscores');

/** D157: optional first name shown after "The Owner" on posts. */
export const businessStaffNameSchema = z.string().trim().min(1).max(STAFF_NAME_MAX);

export const businessRoleSchema = z.enum(['MANAGER', 'STAFF']);

/** Add someone to a place: a new login, or one of the Owner's existing employees. */
export const businessTeamAddSchema = z.strictObject({
  username: businessUsernameSchema,
  role: businessRoleSchema,
  staffName: businessStaffNameSchema.optional(),
});

export const businessTeamUpdateSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('role'), role: businessRoleSchema }),
  z.strictObject({
    action: z.literal('staff-name'),
    staffName: businessStaffNameSchema.nullable(),
  }),
  z.strictObject({ action: z.literal('reset-password') }),
  z.strictObject({ action: z.literal('remove') }),
]);

// ───────────── B1.6: the place's discussion, from the business website ─────────────

/** A new post in the place's discussion (text; no location needed, D172). */
export const businessPostCreateSchema = z.strictObject({
  body: postBodySchema,
  confirmWarning: z.literal(true).optional(),
});

/** A reply to a post (or to a comment on it) in the place's discussion. */
export const businessReplySchema = z.strictObject({
  body: commentBodySchema,
  parentCommentId: z.uuid().optional(),
  confirmWarning: z.literal(true).optional(),
});

/** Remove something the business wrote. */
export const businessDeleteSchema = z.strictObject({});

// ───────────── B1.8: inbox and the daily summary email ─────────────

/** Mark one place's activity seen, or (no placeId) everything, notices included. */
export const businessInboxSeenSchema = z.strictObject({ placeId: z.uuid().optional() });

export const businessEmailNoticesSchema = z.strictObject({ on: z.boolean() });
