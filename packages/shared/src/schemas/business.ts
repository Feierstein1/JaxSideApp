import { z } from 'zod';
import { emailSchema } from './auth';

/** Business portal sign-in (D169). Shape only; the account is checked on the server. */
export const businessLoginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type BusinessLoginInput = z.infer<typeof businessLoginSchema>;
