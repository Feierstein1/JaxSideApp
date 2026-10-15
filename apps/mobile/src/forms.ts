import type { z } from 'zod';
import { ApiRequestError } from './api/client';

export type FieldErrors = Record<string, string>;

/** Client-side check with the shared schema. UX only; the server validates again. */
export function validate<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; errors: FieldErrors } {
  const r = schema.safeParse(values);
  if (r.success) return { ok: true, data: r.data };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || 'form';
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** Maps a server error to form errors: field-level for VALIDATION_ERROR, otherwise a form message. */
export function serverErrors(err: unknown): FieldErrors {
  if (err instanceof ApiRequestError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      const errors: FieldErrors = {};
      for (const d of err.details as { path?: string; message?: string }[]) {
        errors[d.path || 'form'] ??= d.message ?? 'Invalid value';
      }
      return errors;
    }
    return { form: err.message };
  }
  return { form: 'Something went wrong. Please try again.' };
}
