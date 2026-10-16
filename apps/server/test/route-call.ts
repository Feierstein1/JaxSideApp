/** Calls a Next route handler with an optional `[id]` param, like the real router does. */
export type AnyHandler = (req: Request, ctx: never) => Promise<Response>;

export async function callRoute(
  handler: AnyHandler,
  method: string,
  opts: {
    token?: string;
    body?: unknown;
    id?: string;
    /** Route params other than `id` (e.g. `{ username }`). */
    params?: Record<string, string>;
    headers?: Record<string, string>;
    /** Query string, e.g. `{ q: 'ali' }`. */
    query?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const url = new URL('http://localhost/x');
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const req = new Request(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const params = opts.params ?? { id: opts.id ?? '' };
  const res = await handler(req, { params: Promise.resolve(params) } as never);
  const text = await res.text();
  return {
    status: res.status,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: (text ? JSON.parse(text) : undefined) as any,
    raw: text,
  };
}
