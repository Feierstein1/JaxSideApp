/**
 * P5.7: the sign-in details a banned or suspended person just typed, kept in memory
 * only (never stored or put in a URL) so the appeal screen can use them. Cleared when
 * that screen closes.
 */
let creds: { identifier: string; password: string } | null = null;

export const restrictedCredentials = {
  set(identifier: string, password: string) {
    creds = { identifier, password };
  },
  get() {
    return creds;
  },
  clear() {
    creds = null;
  },
};
