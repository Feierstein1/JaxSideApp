/**
 * Where to go after signing in (e.g. back to an invite). Only a path on this site:
 * "//evil.example" and "/\evil.example" would leave it, so they go home instead.
 */
export function safeNext(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : '/';
}
