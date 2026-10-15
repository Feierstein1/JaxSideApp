import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient, type TokenStore } from './client';

function memoryStore(initial: string | null = null): TokenStore & { value: string | null } {
  const s = {
    value: initial,
    get: async () => s.value,
    set: async (t: string) => {
      s.value = t;
    },
    clear: async () => {
      s.value = null;
    },
  };
  return s;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe('api client', () => {
  it('sends the bearer token and JSON body', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { ok: true }));
    const api = createApiClient({ baseUrl: 'http://x/', tokenStore: memoryStore('tok'), fetchFn });
    await api.post('/api/v1/thing', { a: 1 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/api/v1/thing');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.body).toBe('{"a":1}');
  });

  it('omits Authorization when signed out', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, {}));
    const api = createApiClient({ baseUrl: 'http://x', tokenStore: memoryStore(), fetchFn });
    await api.get('/h');
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('maps server error shape to ApiRequestError', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(403, { error: { code: 'LOCATION_REQUIRED', message: 'Need location' } }),
    );
    const api = createApiClient({ baseUrl: 'http://x', tokenStore: memoryStore(), fetchFn });
    await expect(api.get('/h')).rejects.toMatchObject({
      status: 403,
      code: 'LOCATION_REQUIRED',
      message: 'Need location',
    });
  });

  it('clears the stored token and notifies on 401', async () => {
    const store = memoryStore('stale');
    const onUnauthorized = vi.fn();
    const fetchFn = vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED' } }));
    const api = createApiClient({
      baseUrl: 'http://x',
      tokenStore: store,
      fetchFn,
      onUnauthorized,
    });
    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiRequestError);
    expect(store.value).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('reports network failures as NETWORK errors', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const api = createApiClient({ baseUrl: 'http://x', tokenStore: memoryStore(), fetchFn });
    await expect(api.get('/h')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });
});
