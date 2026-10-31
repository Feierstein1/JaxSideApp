import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

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

/** Wraps a route so unexpected errors become a generic 500 with a request ID (never a stack trace). */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return jsonError(err.status, err.code, err.message, err.details);
      const requestId = randomUUID();
      console.error('unhandled route error', requestId, new URL(req.url).pathname, err);
      return jsonError(500, 'INTERNAL', `Something went wrong (ref ${requestId})`);
    }
  };
}

/** Reads a JSON body and checks it against a strict schema. */
export async function parseBody<T>(
  req: Request,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
): Promise<T> {
  const raw: unknown = await req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION', 'Please check what you entered.');
  return parsed.data;
}
