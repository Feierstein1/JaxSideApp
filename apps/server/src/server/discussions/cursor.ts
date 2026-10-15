import { ApiError } from '../http';

/**
 * Opaque pagination bookmarks (P3.5). "New" lists page by (createdAt, id), which stays
 * stable when posts are added while someone scrolls: no duplicates, no skips.
 * "Top" lists page by offset over a fixed window.
 */
export type Cursor = { t: string; id: string } | { o: number };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof c.t === 'string' && typeof c.id === 'string' && UUID.test(c.id)) {
      if (!Number.isNaN(Date.parse(c.t))) return { t: c.t, id: c.id };
    }
    if (typeof c.o === 'number' && Number.isInteger(c.o) && c.o >= 0 && c.o <= 1000) {
      return { o: c.o };
    }
  } catch {
    // fall through
  }
  throw new ApiError(400, 'INVALID_CURSOR', 'Invalid page bookmark');
}
