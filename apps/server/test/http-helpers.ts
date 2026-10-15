import type { Mailer, OutgoingMail } from '@/server/mail/mailer';

type Handler = (req: Request, ctx: unknown) => Promise<Response>;

export interface CallOptions {
  body?: unknown;
  rawBody?: string;
  token?: string;
  headers?: Record<string, string>;
}

/** Invokes a Next route handler directly with a real Request. */
export async function call(handler: Handler, method: string, opts: CallOptions = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: string | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await handler(new Request('http://localhost/test', { method, headers, body }), {});
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, raw: text };
}

export function captureMailer() {
  const sent: OutgoingMail[] = [];
  const mailer: Mailer = {
    async send(mail) {
      sent.push(mail);
    },
  };
  return { mailer, sent };
}

/** Pulls the `token=` value out of an emailed link. */
export function tokenFromMail(mail: OutgoingMail | undefined): string {
  const m = /token=([^\s]+)/.exec(mail?.text ?? '');
  if (!m) throw new Error('no token in email');
  return decodeURIComponent(m[1]!);
}
