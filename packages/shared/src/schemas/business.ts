import { z } from 'zod';
import { passwordSchema } from './auth';

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
