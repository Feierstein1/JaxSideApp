import { describe, expect, it } from 'vitest';
import { ApiError, route } from './http';

const req = new Request('http://localhost/api/v1/x');

describe('route()', () => {
  it('turns unexpected errors into a generic 500 without leaking internals', async () => {
    const handler = route(async () => {
      throw new Error('relation "User" does not exist at /srv/db.ts:42');
    });
    const res = await handler(req, {});
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('relation');
    expect(body).not.toContain('db.ts');
    expect(JSON.parse(body).error.code).toBe('INTERNAL');
  });

  it('passes ApiError status and message through', async () => {
    const handler = route(async () => {
      throw new ApiError(403, 'FORBIDDEN', 'Not allowed');
    });
    const res = await handler(req, {});
    expect(res.status).toBe(403);
    expect((await res.json()).error).toEqual({ code: 'FORBIDDEN', message: 'Not allowed' });
  });
});
