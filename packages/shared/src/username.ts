/** Username rules (D23): 3–20 chars, ASCII letters, digits and underscore. Uniqueness is case-insensitive. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

/** Names that could impersonate staff or system labels. Compared after normalization. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'mod',
  'moderator',
  'support',
  'staff',
  'system',
  'guest',
  'official',
  'jax',
  'jaxapp',
  'root',
  'null',
  'undefined',
  'deleted',
]);

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(username));
}
