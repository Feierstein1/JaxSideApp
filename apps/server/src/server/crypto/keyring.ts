/**
 * Parses and checks the encryption keyring (D35). No imports from env.ts, so env
 * validation can use it at boot without a circular import.
 */

export interface Keyring {
  currentId: string;
  keys: Map<string, Buffer>;
  emailIndexKey: Buffer;
}

/** Parses `ENCRYPTION_KEYS=v1:<base64>,v2:<base64>` style env values. */
export function parseKeyring(
  keysCsv: string,
  currentId: string,
  emailIndexKeyB64: string,
): Keyring {
  const keys = new Map<string, Buffer>();
  for (const entry of keysCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const sep = entry.indexOf(':');
    const id = entry.slice(0, sep);
    const key = Buffer.from(entry.slice(sep + 1), 'base64');
    if (sep < 1 || !/^[A-Za-z0-9_-]{1,16}$/.test(id)) throw new Error('bad key id');
    if (key.length !== 32) throw new Error(`key ${id} must be 32 bytes`);
    if (keys.has(id)) throw new Error(`duplicate key id ${id}`);
    keys.set(id, key);
  }
  if (!keys.has(currentId)) throw new Error(`current key id ${currentId} not in ENCRYPTION_KEYS`);
  const emailIndexKey = Buffer.from(emailIndexKeyB64, 'base64');
  if (emailIndexKey.length !== 32) throw new Error('EMAIL_INDEX_KEY must be 32 bytes');
  for (const k of keys.values()) {
    if (k.equals(emailIndexKey))
      throw new Error('EMAIL_INDEX_KEY must differ from encryption keys');
  }
  return { currentId, keys, emailIndexKey };
}
