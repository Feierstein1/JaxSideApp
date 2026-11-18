import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cached, clearCache, invalidate } from './cache';

describe('cache (D259)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearCache();
  });
  afterEach(() => vi.useRealTimers());

  it('answers from memory inside the time limit, and loads again after it', async () => {
    const load = vi.fn().mockResolvedValue('a');
    await cached('k', 1000, load);
    await cached('k', 1000, load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    await cached('k', 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('force always loads', async () => {
    const load = vi.fn().mockResolvedValue('a');
    await cached('k', 1000, load);
    await cached('k', 1000, load, true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('runs one request when two screens ask at once', async () => {
    const load = vi.fn().mockResolvedValue('a');
    await Promise.all([cached('k', 1000, load), cached('k', 1000, load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never keeps a failure', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ok');
    await expect(cached('k', 1000, load)).rejects.toThrow('offline');
    await expect(cached('k', 1000, load)).resolves.toBe('ok');
  });

  it('invalidate drops matching keys only', async () => {
    const a = vi.fn().mockResolvedValue(1);
    const b = vi.fn().mockResolvedValue(2);
    await cached('events:list', 1000, a);
    await cached('friends:list', 1000, b);
    invalidate('events:');
    await cached('events:list', 1000, a);
    await cached('friends:list', 1000, b);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('an answer that was on its way when a change happened is not kept', async () => {
    let resolve!: (v: string) => void;
    const slow = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const p = cached('k', 1000, slow);
    invalidate('k'); // e.g. the person unfollowed while the list was loading
    resolve('old');
    await p;
    const fresh = vi.fn().mockResolvedValue('new');
    await expect(cached('k', 1000, fresh)).resolves.toBe('new');
  });

  it('clearCache forgets everything', async () => {
    const load = vi.fn().mockResolvedValue('a');
    await cached('k', 1000, load);
    clearCache();
    await cached('k', 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
