import type { z } from 'zod';
import { ApiError } from './http';

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Reads and validates a JSON body against a strict schema (§17).
 * Error details list field paths and messages only, never the submitted values.
 */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Some fields are invalid',
      result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.code === 'unrecognized_keys' ? 'Unexpected field' : i.message,
        ...(i.code === 'unrecognized_keys' ? { fields: i.keys } : {}),
      })),
    );
  }
  return result.data;
}
