import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth';

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
