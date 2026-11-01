'use client';

import { TEXT } from '@/text';

/** The CSRF token the server set in a readable cookie; echoed on every change. */
function csrfToken(): string {
  const match = document.cookie.split('; ').find((c) => c.startsWith('jax_biz_csrf='));
  return match ? decodeURIComponent(match.slice('jax_biz_csrf='.length)) : '';
}

/** POSTs JSON to this site's API. Throws an Error with the server's plain-words message. */
export async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message ?? TEXT.common.failed);
  return json as T;
}
