/**
 * Typed API client. Pure TypeScript (no React Native imports) so it is unit-testable.
 * The server is authoritative; this client never decides permissions (§3).
 */

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type FetchFn = typeof fetch;

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore: TokenStore;
  fetchFn?: FetchFn;
  /** Called when the server rejects the session, so the app can return to sign-in. */
  onUnauthorized?: () => void;
}

export function createApiClient(opts: ApiClientOptions) {
  const fetchFn = opts.fetchFn ?? fetch;
  const base = opts.baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = await opts.tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetchFn(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError(0, 'NETWORK', 'Could not reach the server. Check your connection.');
    }

    const text = await res.text();
    const json: unknown = text ? safeJson(text) : undefined;

    if (!res.ok) {
      if (res.status === 401) {
        await opts.tokenStore.clear();
        opts.onUnauthorized?.();
      }
      const err = (json as { error?: { code?: string; message?: string; details?: unknown } })
        ?.error;
      throw new ApiRequestError(
        res.status,
        err?.code ?? 'HTTP_ERROR',
        err?.message ?? `Request failed (${res.status})`,
        err?.details,
      );
    }
    return json as T;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
