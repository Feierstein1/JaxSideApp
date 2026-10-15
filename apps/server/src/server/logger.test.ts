import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { logger: createLogger('info', stream), lines };
}

describe('logger redaction', () => {
  it('redacts PII and credentials at top level and nested', () => {
    const { logger, lines } = capture();
    logger.info(
      {
        email: 'a@b.com',
        password: 'hunter22hunter22',
        user: { email: 'c@d.com', birthYear: 1990 },
        req: { headers: { authorization: 'Bearer abc123', cookie: 'sid=xyz' } },
        reading: { latitude: 30.33, longitude: -81.65 },
        userId: 'u_123',
      },
      'test',
    );
    const out = lines.join('');
    for (const leaked of [
      'a@b.com',
      'c@d.com',
      'hunter22',
      '1990',
      'abc123',
      'sid=xyz',
      '30.33',
      '-81.65',
    ]) {
      expect(out).not.toContain(leaked);
    }
    // Non-sensitive identifiers remain for debugging.
    expect(out).toContain('u_123');
  });
});
