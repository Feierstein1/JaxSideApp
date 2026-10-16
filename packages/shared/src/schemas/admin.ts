import { z } from 'zod';
import { loginRequestSchema } from './auth';

/** P5.11: admin sign-in step 1 is the normal credential check. */
export const adminLoginSchema = loginRequestSchema;

/** Step 2: the signed challenge from step 1 and the 6-digit authenticator code. */
export const adminLoginVerifySchema = z.strictObject({
  challenge: z.string().min(10).max(300),
  code: z
    .string()
    .trim()
    .regex(/^\d{3} ?\d{3}$/, 'Enter the 6-digit code'),
});
