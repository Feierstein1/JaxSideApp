import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logger } from './logger';

/** Error a route can throw to return a specific, client-safe response. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler so unexpected errors become a generic 500 with a request ID.
 * Stack traces and internal messages are logged, never returned (§17).
 */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        const res = jsonError(err.status, err.code, err.message, err.details);
        // P5.3: standard header so clients (and proxies) know when to retry.
        const wait = (err.details as { retryAfterSeconds?: unknown } | undefined)
          ?.retryAfterSeconds;
        if (err.status === 429 && typeof wait === 'number') {
          res.headers.set('Retry-After', String(wait));
        }
        return res;
      }
      const requestId = randomUUID();
      logger.error({ err, requestId, path: new URL(req.url).pathname }, 'unhandled route error');
      return jsonError(500, 'INTERNAL', `Something went wrong (ref ${requestId})`);
    }
  };
}
